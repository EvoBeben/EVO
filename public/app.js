// EVO Day Trader Trends Dashboard — client. Vanilla JS, hand-drawn canvas charts.
"use strict";

const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const $ = (sel) => document.querySelector(sel);

let LAST = null;            // last dashboard payload
let HIDDEN = new Set();     // series toggled off in combined chart
let autoTimer = null;

// ---------- formatting ----------
function fmtPrice(v) {
  if (v == null) return "—";
  if (v >= 1000) return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (v >= 1) return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 0.01) return "$" + v.toFixed(4);
  return "$" + v.toPrecision(2);
}
function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}
function fmtBig(v) {
  if (v == null) return "—";
  const u = [["T", 1e12], ["B", 1e9], ["M", 1e6], ["K", 1e3]];
  for (const [s, n] of u) if (Math.abs(v) >= n) return (v / n).toFixed(1) + s;
  return String(v);
}
const cls = (v) => (v >= 0 ? "up" : "down");

// ---------- HiDPI canvas helper ----------
function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

// ---------- sparkline (single series, area + line) ----------
function sparkline(canvas, data, color) {
  if (!canvas) return;
  const { ctx, w, h } = setup(canvas);
  ctx.clearRect(0, 0, w, h);
  const pts = (data || []).filter((v) => v != null && !Number.isNaN(v));
  if (pts.length < 2) return;
  const min = Math.min(...pts), max = Math.max(...pts);
  const pad = 3, span = max - min || 1;
  const x = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);

  ctx.beginPath();
  ctx.moveTo(x(0), y(pts[0]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(x(i), y(pts[i]));
  // area
  ctx.lineTo(x(pts.length - 1), h - pad);
  ctx.lineTo(x(0), h - pad);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, hexA(color, 0.28));
  grad.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = grad;
  ctx.fill();
  // line
  ctx.beginPath();
  ctx.moveTo(x(0), y(pts[0]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(x(i), y(pts[i]));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();
  // end dot
  ctx.beginPath();
  ctx.arc(x(pts.length - 1), y(pts[pts.length - 1]), 2.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// hex (#rrggbb) -> rgba string with alpha
function hexA(hex, a) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------- combined normalized (indexed to 100) multi-series chart ----------
const combined = { series: [], geom: null };

function drawCombined() {
  const canvas = $("#combined");
  const { ctx, w, h } = setup(canvas);
  ctx.clearRect(0, 0, w, h);
  const padL = 44, padR = 12, padT = 12, padB = 22;
  const plotW = w - padL - padR, plotH = h - padT - padB;

  const active = combined.series.filter((s) => !HIDDEN.has(s.symbol));
  if (!active.length) { combined.geom = null; return; }

  const maxLen = Math.max(...active.map((s) => s.norm.length));
  let lo = Infinity, hi = -Infinity;
  for (const s of active) for (const v of s.norm) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;

  const X = (i) => padL + (i / (maxLen - 1)) * plotW;
  const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * plotH;

  // gridlines + y labels (5 steps)
  ctx.font = "10px " + css("--font");
  ctx.textBaseline = "middle";
  ctx.fillStyle = css("--muted");
  ctx.strokeStyle = css("--grid");
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const val = lo + ((hi - lo) * i) / 4;
    const y = Y(val);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(val.toFixed(0), padL - 6, y);
  }
  // baseline at 100
  if (100 >= lo && 100 <= hi) {
    ctx.strokeStyle = css("--baseline");
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, Y(100)); ctx.lineTo(w - padR, Y(100)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // series lines
  for (const s of active) {
    ctx.beginPath();
    s.norm.forEach((v, i) => {
      const px = X(i * (maxLen - 1) / (s.norm.length - 1));
      const py = Y(v);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  combined.geom = { padL, padR, padT, padB, plotW, plotH, w, h, lo, hi, maxLen, X, Y, active };
}

function combinedHover(evt) {
  const g = combined.geom;
  const tip = $("#combined-tip");
  if (!g) { tip.hidden = true; return; }
  const canvas = $("#combined");
  const rect = canvas.getBoundingClientRect();
  const mx = evt.clientX - rect.left;
  if (mx < g.padL || mx > g.w - g.padR) { tip.hidden = true; return; }
  const frac = (mx - g.padL) / g.plotW;
  const idx = Math.round(frac * (g.maxLen - 1));

  // crosshair
  drawCombined();
  const ctx = canvas.getContext("2d");
  const x = g.X(idx);
  ctx.strokeStyle = css("--baseline");
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, g.padT); ctx.lineTo(x, g.padT + g.plotH); ctx.stroke();

  const rows = [];
  for (const s of g.active) {
    const si = Math.round((idx / (g.maxLen - 1)) * (s.norm.length - 1));
    const v = s.norm[si];
    if (v == null) continue;
    ctx.beginPath(); ctx.arc(x, g.Y(v), 3, 0, Math.PI * 2);
    ctx.fillStyle = s.color; ctx.fill();
    rows.push({ sym: s.symbol, color: s.color, delta: v - 100 });
  }
  rows.sort((a, b) => b.delta - a.delta);
  tip.innerHTML =
    `<div class="tt-title">Δ vs start</div>` +
    rows.map((r) =>
      `<div class="tt-row"><span><span class="swatch" style="background:${r.color}"></span>${r.sym}</span>` +
      `<span class="${r.delta >= 0 ? "up" : "down"}">${fmtPct(r.delta)}</span></div>`
    ).join("");
  tip.style.left = Math.min(Math.max(x, 90), g.w - 90) + "px";
  tip.style.top = g.padT + 10 + "px";
  tip.hidden = false;
}

// ---------- render ----------
function seriesColor(i) { return css(SERIES[i % SERIES.length]); }

function normalize(spark) {
  const pts = (spark || []).filter((v) => v != null && !Number.isNaN(v));
  if (pts.length < 2) return [];
  const base = pts[0] || 1;
  return pts.map((v) => (v / base) * 100);
}

function renderStats(data) {
  const movers = data.movers;
  const withChg = movers.filter((m) => m.change24h != null);
  const avg = withChg.length ? withChg.reduce((a, m) => a + m.change24h, 0) / withChg.length : 0;
  const gainers = withChg.filter((m) => m.change24h >= 0).length;
  const top = movers[0];
  const hottest = [...movers].sort((a, b) => (b.change24h ?? -1e9) - (a.change24h ?? -1e9))[0];

  const fg = data.market && data.market.fearGreed;
  const tiles = [
    { label: "Tracked movers", value: String(movers.length), sub: `${gainers} up · ${movers.length - gainers} down` },
    { label: "Avg 24h move", value: fmtPct(avg), sub: "across the top 10", cls: cls(avg) },
    { label: "Top by buzz", value: top ? top.symbol : "—", sub: top ? `score ${top.socialScore}` : "" },
    fg
      ? { label: "Fear & Greed", value: String(fg.value), sub: fg.label, cls: fg.value >= 55 ? "up" : fg.value <= 45 ? "down" : "" }
      : { label: "Biggest 24h move", value: hottest ? fmtPct(hottest.change24h) : "—", sub: hottest ? hottest.symbol : "", cls: hottest ? cls(hottest.change24h) : "" },
  ];
  $("#stats").innerHTML = tiles.map((t) =>
    `<div class="tile"><div class="label">${t.label}</div>` +
    `<div class="value ${t.cls || ""}">${t.value}</div>` +
    `<div class="sub">${t.sub || ""}</div></div>`
  ).join("");
}

function srcBadge(s) {
  const key = s.toLowerCase().includes("reddit") ? "reddit"
    : s.toLowerCase().includes("stocktwits") ? "stocktwits"
    : s.toLowerCase().includes("coingecko") ? "coingecko" : "";
  const label = key === "coingecko" ? "CG" : key === "stocktwits" ? "ST" : key === "reddit" ? "RDT" : s;
  return `<span class="src ${key}" title="${s}">${label}</span>`;
}

function renderMovers(data) {
  const ol = $("#movers");
  if (!data.movers.length) {
    ol.innerHTML = `<li class="skeleton">No social-trend movers with price data right now. Live sources may be rate-limited — try Refresh in a minute.</li>`;
    return;
  }
  ol.innerHTML = data.movers.map((m, i) => {
    const color = m.change24h >= 0 ? css("--up") : css("--down");
    const kindBadge = m.image
      ? `<img src="${m.image}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'badge-kind',textContent:'${m.kind === "crypto" ? "◈" : "▤"}'}))">`
      : `<span class="badge-kind">${m.kind === "crypto" ? "◈" : "▤"}</span>`;
    return `<li class="mover" data-i="${i}">
      <span class="col-rank">${i + 1}</span>
      <span class="asset">${kindBadge}
        <span class="names"><span class="sym">${m.symbol}</span><span class="name">${m.name || ""}</span></span>
      </span>
      <span class="col-spark"><canvas data-spark="${i}" data-color="${color}"></canvas></span>
      <span class="col-price">${fmtPrice(m.price)}</span>
      <span class="col-chg"><span class="pill ${cls(m.change24h)}">${fmtPct(m.change24h)}</span></span>
      <span class="col-social">
        <span class="score">${m.socialScore}</span>
        <span class="srcs">${(m.sources || []).map(srcBadge).join("")}</span>
      </span>
    </li>`;
  }).join("");

  // draw row sparklines
  data.movers.forEach((m, i) => {
    const c = ol.querySelector(`canvas[data-spark="${i}"]`);
    sparkline(c, m.spark, c.dataset.color);
  });
}

function renderMinis(data) {
  const wrap = $("#minis");
  wrap.innerHTML = data.movers.map((m, i) => {
    const color = m.change24h >= 0 ? css("--up") : css("--down");
    return `<div class="mini">
      <div class="mini-top"><span class="sym">${m.symbol}</span>
        <span class="chg ${cls(m.change24h)}">${fmtPct(m.change24h)}</span></div>
      <canvas data-mini="${i}" data-color="${color}"></canvas>
    </div>`;
  }).join("");
  data.movers.forEach((m, i) => {
    const c = wrap.querySelector(`canvas[data-mini="${i}"]`);
    sparkline(c, m.spark, c.dataset.color);
  });
}

function renderLegend(data) {
  const legend = $("#legend");
  legend.innerHTML = combined.series.map((s) =>
    `<span class="item ${HIDDEN.has(s.symbol) ? "off" : ""}" data-sym="${s.symbol}">
      <span class="swatch" style="background:${s.color}"></span>${s.symbol}</span>`
  ).join("");
  legend.querySelectorAll(".item").forEach((el) => {
    el.onclick = () => {
      const sym = el.dataset.sym;
      HIDDEN.has(sym) ? HIDDEN.delete(sym) : HIDDEN.add(sym);
      el.classList.toggle("off");
      drawCombined();
    };
  });
}

function buildCombined(data) {
  // keep the 6 strongest social movers that actually have usable series
  combined.series = data.movers
    .map((m, i) => ({ symbol: m.symbol, norm: normalize(m.spark), color: seriesColor(i) }))
    .filter((s) => s.norm.length >= 2)
    .slice(0, 6);
}

function renderDemoBanner(data) {
  const existing = $("#demo-banner");
  if (data.demo) {
    if (existing) return;
    const el = document.createElement("div");
    el.id = "demo-banner";
    el.className = "demo-banner";
    el.innerHTML = "◆ Showing <strong>demo data</strong> — live sources are unreachable from this network. " +
      "Run locally (<code>npm start</code>) on an unrestricted connection for live CoinGecko / Stocktwits / Reddit / Yahoo data.";
    $(".disclaimer").after(el);
  } else if (existing) {
    existing.remove();
  }
}

function renderAll(data) {
  LAST = data;
  renderDemoBanner(data);
  renderStats(data);
  renderMovers(data);
  buildCombined(data);
  renderLegend(data);
  drawCombined();
  renderMinis(data);
  const when = new Date(data.generatedAt);
  $("#updated").textContent = "updated " + when.toLocaleTimeString();
}

// ---------- data loading ----------
async function load() {
  const btn = $("#refresh");
  btn.classList.add("busy");
  const t0 = performance.now();
  try {
    const res = await fetch("/api/dashboard");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    renderAll(data);
    $("#latency").textContent = `fetched in ${Math.round(performance.now() - t0)} ms`;
  } catch (err) {
    $("#movers").innerHTML = `<li class="skeleton err">Could not load live data: ${err.message}. Retrying on next refresh.</li>`;
  } finally {
    btn.classList.remove("busy");
  }
}

// ---------- controls ----------
function setTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  localStorage.setItem("evo-theme", mode);
  if (LAST) renderAll(LAST); // recolor canvases
}
$("#theme").onclick = () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(cur === "dark" ? "light" : "dark");
};
$("#refresh").onclick = load;

function setAuto(on) {
  clearInterval(autoTimer);
  if (on) autoTimer = setInterval(load, 60_000);
}
$("#autorefresh").onchange = (e) => setAuto(e.target.checked);

const cv = $("#combined");
cv.addEventListener("mousemove", combinedHover);
cv.addEventListener("mouseleave", () => { $("#combined-tip").hidden = true; drawCombined(); });

let rz;
window.addEventListener("resize", () => {
  clearTimeout(rz);
  rz = setTimeout(() => { if (LAST) renderAll(LAST); }, 150);
});

// ---------- boot ----------
setTheme(localStorage.getItem("evo-theme") || "dark");
setAuto(true);
load();
