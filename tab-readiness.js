import { state, localDate, rmSk, hmStr, clamp, scoreRow } from './shared.js';

export const readinessHTML = `
  <div class="hero">
    <div class="gauge-col"><svg id="gauge-svg" width="120" height="110"></svg></div>
    <div class="hero-right">
      <div class="hero-state" id="score-state">LOADING</div>
      <div class="hero-desc" id="hero-desc"></div>
      <div class="hero-sub" id="hero-sub"></div>
    </div>
  </div>
  <div class="pillars">
    <div class="pillar">
      <div class="pillar-top"><span class="pillar-name">HRV</span><span class="pillar-pct sk" id="pp-hrv">—</span></div>
      <div class="pillar-bar-track"><div class="pillar-bar-fill" id="pb-hrv" style="background:var(--c-hrv)"></div></div>
      <div class="pillar-bottom">
        <span class="pillar-value sk sk-b" id="pv-hrv" style="color:var(--c-hrv);min-width:44px">—</span>
        <span class="pillar-unit">ms</span>
        <span class="pillar-delta" id="pd-hrv"></span>
      </div>
    </div>
    <div class="pillar">
      <div class="pillar-top"><span class="pillar-name">Sleep</span><span class="pillar-pct sk" id="pp-sleep">—</span></div>
      <div class="pillar-bar-track"><div class="pillar-bar-fill" id="pb-sleep" style="background:var(--c-sleep)"></div></div>
      <div class="pillar-bottom">
        <span class="pillar-value sk sk-b" id="pv-sleep" style="color:var(--c-sleep);min-width:32px">—</span>
        <span class="pillar-unit">/100</span>
        <span class="pillar-delta" id="pd-sleep"></span>
      </div>
    </div>
    <div class="pillar">
      <div class="pillar-top"><span class="pillar-name">Resting HR</span><span class="pillar-pct sk" id="pp-rhr">—</span></div>
      <div class="pillar-bar-track"><div class="pillar-bar-fill" id="pb-rhr" style="background:var(--c-rhr)"></div></div>
      <div class="pillar-bottom">
        <span class="pillar-value sk sk-b" id="pv-rhr" style="color:var(--c-rhr);min-width:32px">—</span>
        <span class="pillar-unit">bpm</span>
        <span class="pillar-delta" id="pd-rhr"></span>
      </div>
    </div>
    <div class="pillar">
      <div class="pillar-top"><span class="pillar-name">Stress</span><span class="pillar-pct sk" id="pp-stress">—</span></div>
      <div class="pillar-bar-track"><div class="pillar-bar-fill" id="pb-stress" style="background:var(--c-stress)"></div></div>
      <div class="pillar-bottom">
        <span class="pillar-value sk sk-b" id="pv-stress" style="color:var(--c-stress);min-width:28px">—</span>
        <span class="pillar-unit">avg</span>
        <span class="pillar-delta" id="pd-stress"></span>
      </div>
    </div>
  </div>
  <div class="sleep-row">
    <div class="sleep-seg">
      <span class="sleep-seg-label">Deep</span>
      <span class="sleep-seg-val sk sk-b" id="sl-deep" style="color:#5A7FFF;min-width:34px">—</span>
      <div class="sleep-seg-bar"><div class="sleep-seg-fill" id="slb-deep" style="background:#5A7FFF"></div></div>
    </div>
    <div class="sleep-seg">
      <span class="sleep-seg-label">Light</span>
      <span class="sleep-seg-val sk sk-b" id="sl-light" style="color:#7B9EFF;min-width:34px">—</span>
      <div class="sleep-seg-bar"><div class="sleep-seg-fill" id="slb-light" style="background:#7B9EFF"></div></div>
    </div>
    <div class="sleep-seg">
      <span class="sleep-seg-label">REM</span>
      <span class="sleep-seg-val sk sk-b" id="sl-rem" style="color:#A78BFF;min-width:34px">—</span>
      <div class="sleep-seg-bar"><div class="sleep-seg-fill" id="slb-rem" style="background:#A78BFF"></div></div>
    </div>
    <div class="sleep-seg">
      <span class="sleep-seg-label">Awake</span>
      <span class="sleep-seg-val sk sk-b" id="sl-awake" style="color:#FF5A6E;min-width:34px">—</span>
      <div class="sleep-seg-bar"><div class="sleep-seg-fill" id="slb-awake" style="background:#FF5A6E"></div></div>
    </div>
  </div>
  <div class="r-chart-section">
    <div class="section-header">
      <span class="section-title">Readiness History</span>
      <div class="r-range-wrap">
        <button class="r-range-btn active" data-d="7"  onclick="rSetRange(7)">7D</button>
        <button class="r-range-btn"        data-d="14" onclick="rSetRange(14)">14D</button>
        <button class="r-range-btn"        data-d="28" onclick="rSetRange(28)">28D</button>
      </div>
    </div>
    <div class="r-chart-canvas" id="r-ch-wrap"></div>
  </div>
  <div class="sync-footer" id="sync-footer"></div>
`;

const DESCS = {
  OPTIMAL: "Body is primed — high HRV, strong sleep, low stress. Ideal for a hard session.",
  GOOD:    "Solid recovery. Train at planned intensity with normal effort.",
  MODERATE:"Partial recovery. Consider reducing intensity or keeping it aerobic.",
  RECOVER: "Body is under stress. Rest day or easy active recovery recommended."
};

function readinessState(s) {
  if (s >= 80) return { label: "OPTIMAL", color: "var(--optimal)", hex: "#00E5A0" };
  if (s >= 65) return { label: "GOOD", color: "var(--good)", hex: "#00D4C8" };
  if (s >= 45) return { label: "MODERATE", color: "var(--compromised)", hex: "#F5C842" };
  return { label: "RECOVER", color: "var(--low)", hex: "#FF5A6E" };
}

export function drawGauge(score, hex) {
  const svg = d3.select("#gauge-svg");
  svg.selectAll("*").remove();
  const cx = 60, cy = 78, r = 50, sw = 9;
  const sa = -Math.PI * 0.78, ea = Math.PI * 0.78;
  const arc = d3.arc().innerRadius(r - sw).outerRadius(r).startAngle(sa);
  const defs = svg.append("defs");
  const gf = defs.append("filter").attr("id", "gg").attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%");
  gf.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "b");
  gf.append("feMerge").selectAll("feMergeNode").data(["b", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);
  svg.append("path").attr("transform", `translate(${cx},${cy})`).attr("d", arc({ endAngle: ea })).attr("fill", "#1A2640");
  const gp = svg.append("path").attr("transform", `translate(${cx},${cy})`).attr("d", arc({ endAngle: sa }))
    .attr("fill", "none").attr("stroke", hex).attr("stroke-width", 3).attr("opacity", .28).attr("filter", "url(#gg)");
  const fp = svg.append("path").attr("transform", `translate(${cx},${cy})`).attr("d", arc({ endAngle: sa }))
    .attr("fill", hex).attr("opacity", .92);
  const fillEnd = sa + (ea - sa) * (score / 100);
  [fp, gp].forEach(p => {
    p.transition().duration(900).ease(d3.easeCubicOut)
      .attrTween("d", () => { const i = d3.interpolate(sa, fillEnd); return t => arc({ endAngle: i(t) }); });
  });
  [[45, "#F5C842"], [65, "#00D4C8"], [80, "#00E5A0"]].forEach(([pct, col]) => {
    const a = sa + (ea - sa) * (pct / 100);
    svg.append("line")
      .attr("x1", cx + (r - sw - 2) * Math.cos(a - Math.PI / 2)).attr("y1", cy + (r - sw - 2) * Math.sin(a - Math.PI / 2))
      .attr("x2", cx + (r + 4) * Math.cos(a - Math.PI / 2)).attr("y2", cy + (r + 4) * Math.sin(a - Math.PI / 2))
      .attr("stroke", col).attr("stroke-width", 1.2).attr("opacity", .55);
  });
  const midR = r - sw / 2;
  const dot = svg.append("circle")
    .attr("cx", cx + midR * Math.cos(sa - Math.PI / 2)).attr("cy", cy + midR * Math.sin(sa - Math.PI / 2))
    .attr("r", sw / 2 + 1).attr("fill", hex);
  dot.transition().duration(900).ease(d3.easeCubicOut)
    .attrTween("cx", () => { const i = d3.interpolate(sa, fillEnd); return t => cx + midR * Math.cos(i(t) - Math.PI / 2); })
    .attrTween("cy", () => { const i = d3.interpolate(sa, fillEnd); return t => cy + midR * Math.sin(i(t) - Math.PI / 2); });
  const dotEndX = cx + midR * Math.cos(fillEnd - Math.PI / 2), dotEndY = cy + midR * Math.sin(fillEnd - Math.PI / 2);
  svg.append("circle").attr("cx", dotEndX).attr("cy", dotEndY).attr("r", 2).attr("fill", "#fff").attr("opacity", 0)
    .transition().delay(880).duration(150).attr("opacity", 1);
  svg.append("text").attr("x", cx).attr("y", cy - 6)
    .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
    .attr("font-family", "Satoshi,Inter,system-ui,sans-serif")
    .attr("font-size", "34px").attr("font-weight", "900").attr("fill", hex).text(score);
  svg.append("text").attr("x", cx).attr("y", cy + 20)
    .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
    .attr("font-family", "Satoshi,Inter,system-ui,sans-serif")
    .attr("font-size", "10px").attr("font-weight", "500").attr("fill", "#5A6A88").text("/ 100");
}

export function setPillar(id, score, value, deltaVal, color) {
  const pct = rmSk(`pp-${id}`); if (pct) pct.textContent = `${score}%`;
  setTimeout(() => { const b = document.getElementById(`pb-${id}`); if (b) b.style.width = score + '%'; }, 60);
  const val = rmSk(`pv-${id}`); if (val) { val.textContent = value; val.style.color = color; }
  const dd = document.getElementById(`pd-${id}`);
  if (dd && deltaVal !== null && deltaVal !== undefined) {
    const pos = deltaVal > 0, zero = deltaVal === 0;
    dd.textContent = zero ? '' : (pos ? `↑${Math.abs(deltaVal)}` : `↓${Math.abs(deltaVal)}`);
    dd.className = 'pillar-delta ' + (zero ? 'neu' : pos ? 'pos' : 'neg');
  }
}

export function renderSleep(row, valPrefix, barPrefix) {
  valPrefix = valPrefix || 'sl-';
  barPrefix = barPrefix || 'slb-';
  const total = row.sleep_duration_s || 1;
  [{ s: row.deep_sleep_s, id: 'deep' }, { s: row.light_sleep_s, id: 'light' }, { s: row.rem_sleep_s, id: 'rem' }, { s: row.awake_s, id: 'awake' }]
    .forEach(({ s, id }) => {
      const el = rmSk(`${valPrefix}${id}`); if (el) el.textContent = s ? hmStr(s) : '—';
      const pct = s ? Math.round(s / total * 100) : 0;
      setTimeout(() => { const b = document.getElementById(`${barPrefix}${id}`); if (b) b.style.width = pct + '%'; }, 120);
    });
}

export function rDrawHistory(rows) {
  const wrap = document.getElementById("r-ch-wrap");
  if (!wrap) return;
  d3.select("#r-ch-wrap").selectAll("svg").remove();
  const W = wrap.clientWidth || 340, H = wrap.clientHeight || 140, n = rows.length;
  const pT = 8, pB = 22, pL = 20, pR = 8, iW = W - pL - pR, iH = H - pT - pB;
  const yS = d3.scaleLinear().domain([0, 100]).range([pT + iH, pT]);
  const xS = i => pL + (i + 0.5) * (iW / n);
  const svg = d3.select("#r-ch-wrap").append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "none");
  const defs = svg.append("defs");
  const gr = defs.append("linearGradient").attr("id", "rg2").attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
  gr.append("stop").attr("offset", "0%").attr("stop-color", "#00D4C8").attr("stop-opacity", .3);
  gr.append("stop").attr("offset", "100%").attr("stop-color", "#00D4C8").attr("stop-opacity", 0);
  [{ lo: 0, hi: 45, col: "#FF5A6E" }, { lo: 45, hi: 65, col: "#F5C842" }, { lo: 65, hi: 80, col: "#00D4C8" }, { lo: 80, hi: 100, col: "#00E5A0" }]
    .forEach(({ lo, hi, col }) => {
      svg.append("rect").attr("x", pL).attr("y", yS(hi)).attr("width", iW).attr("height", yS(lo) - yS(hi)).attr("fill", col).attr("opacity", .04);
    });
  [45, 65, 80].forEach(v => {
    const y = yS(v);
    svg.append("line").attr("x1", pL).attr("x2", W - pR).attr("y1", y).attr("y2", y).attr("stroke", "#1A2640").attr("stroke-width", .5);
    svg.append("text").attr("x", pL - 3).attr("y", y + 3.5).attr("text-anchor", "end").attr("font-size", "6.5px").attr("font-family", "Satoshi,Inter,sans-serif").attr("fill", "#2E3D58").text(v);
  });
  const pts = rows.map((r, i) => r._score != null ? { x: xS(i), y: yS(r._score), s: r._score, r } : null).filter(Boolean);
  if (pts.length >= 2) {
    const line = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveCatmullRom.alpha(0.5));
    const area = d3.area().x(d => d.x).y0(pT + iH).y1(d => d.y).curve(d3.curveCatmullRom.alpha(0.5));
    svg.append("path").datum(pts).attr("d", area).attr("fill", "url(#rg2)");
    const p = svg.append("path").datum(pts).attr("d", line).attr("fill", "none").attr("stroke", "#00D4C8").attr("stroke-width", 1.8).attr("stroke-linecap", "round");
    const len = p.node().getTotalLength();
    p.attr("stroke-dasharray", len).attr("stroke-dashoffset", len).transition().duration(800).ease(d3.easeCubicOut).attr("stroke-dashoffset", 0);
    pts.forEach(pt => {
      const st = readinessState(pt.s);
      svg.append("circle").attr("cx", pt.x).attr("cy", pt.y).attr("r", 2.5).attr("fill", st.hex).attr("stroke", "#06090F").attr("stroke-width", 1);
    });
    const lp = pts[pts.length - 1], ls = readinessState(lp.s);
    svg.append("circle").attr("cx", lp.x).attr("cy", lp.y).attr("r", 5.5).attr("fill", ls.hex).attr("opacity", .18);
    svg.append("circle").attr("cx", lp.x).attr("cy", lp.y).attr("r", 3).attr("fill", ls.hex);
    svg.append("circle").attr("cx", lp.x).attr("cy", lp.y).attr("r", 1.2).attr("fill", "#fff");
  }
  const todayStr = localDate(0), every = n <= 7 ? 1 : n <= 14 ? 2 : 4;
  rows.forEach((r, i) => {
    if (i % every !== 0 && r.date !== todayStr) return;
    const d = new Date(r.date + "T12:00:00");
    const lbl = String(d.getDate()).padStart(2, "0") + "/" + (d.getMonth() + 1);
    svg.append("text").attr("x", xS(i)).attr("y", H - 4).attr("text-anchor", "middle")
      .attr("font-size", "7px").attr("font-family", "Satoshi,Inter,sans-serif")
      .attr("fill", r.date === todayStr ? "#00D4C8" : "#2E3D58")
      .attr("font-weight", r.date === todayStr ? "700" : "400").text(lbl);
  });
  const tt = document.getElementById("tt");
  svg.append("rect").attr("x", pL).attr("y", pT).attr("width", iW).attr("height", iH)
    .attr("fill", "transparent").attr("cursor", "crosshair")
    .on("mousemove", function (event) {
      const [mx] = d3.pointer(event, this);
      const i = clamp(Math.round(mx / (iW / n) - 0.5), 0, n - 1);
      const row = rows[i], sc = row._score, st = readinessState(sc);
      const dl = new Date(row.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      tt.style.opacity = "1"; tt.style.left = (event.clientX + 14) + "px"; tt.style.top = (event.clientY - 14) + "px";
      tt.innerHTML = `<div style="color:#5A6A88;font-size:10px;font-weight:600;margin-bottom:3px">${dl}</div>
        <div><b style="color:${st.hex}">${sc}</b><span style="color:#5A6A88"> / 100 · ${st.label}</span></div>
        ${row.hrv_last_night ? `<div style="font-size:10.5px;color:#8898BB">HRV <b style="color:#00D4C8">${(+row.hrv_last_night).toFixed(1)}</b> ms</div>` : ''}
        ${row.resting_hr ? `<div style="font-size:10.5px;color:#8898BB">RHR <b style="color:#FF5A6E">${row.resting_hr}</b> bpm</div>` : ''}
        ${row.sleep_score ? `<div style="font-size:10.5px;color:#8898BB">Sleep <b style="color:#7B9EFF">${row.sleep_score}</b>/100</div>` : ''}`;
    }).on("mouseleave", () => tt.style.opacity = "0");
}

export function rSetRange(days) {
  state.rActiveDay = days;
  document.querySelectorAll(".r-range-btn").forEach(b => b.classList.toggle("active", +b.dataset.d === days));
  rDrawHistory(state.allRows.slice(-days));
}

window.rSetRange = rSetRange;

export function renderReadiness(rows) {
  const container = document.getElementById('panel-readiness');
  if (container.innerHTML.trim() === '') {
    container.innerHTML = readinessHTML;
  }

  const ts = localDate(0), ys = localDate(1);
  const today = rows.find(r => r.date === ts) || rows[rows.length - 1];
  const yest = rows.find(r => r.date === ys) || (rows.length >= 2 ? rows[rows.length - 2] : null);
  const s = scoreRow(today, rows);
  const sp = yest ? scoreRow(yest, rows) : null;
  const st = readinessState(s.composite);
  const se = rmSk("score-state"); if (se) { se.textContent = st.label; se.style.color = st.color; }
  document.getElementById("hero-desc").textContent = DESCS[st.label] || "";
  document.getElementById("hero-sub").textContent = today.hrv_status ? `Garmin status: ${today.hrv_status.charAt(0) + today.hrv_status.slice(1).toLowerCase()}` : "";
  drawGauge(s.composite, st.hex);
  const dHrv = yest && today.hrv_last_night && yest.hrv_last_night ? Math.round(+today.hrv_last_night - +yest.hrv_last_night) : null;
  const dSlp = sp ? s.sleep - sp.sleep : null;
  const dRhr = yest && today.resting_hr && yest.resting_hr ? -(today.resting_hr - yest.resting_hr) : null;
  const dSt = yest && today.stress_avg != null && yest.stress_avg != null ? -(today.stress_avg - yest.stress_avg) : null;
  setPillar("hrv", s.hrv, today.hrv_last_night ? (+today.hrv_last_night).toFixed(1) : "—", dHrv, "var(--c-hrv)");
  setPillar("sleep", s.sleep, today.sleep_score != null ? String(today.sleep_score) : "—", dSlp, "var(--c-sleep)");
  setPillar("rhr", s.rhr, today.resting_hr || "—", dRhr, "var(--c-rhr)");
  setPillar("stress", s.stress, today.stress_avg != null ? String(today.stress_avg) : "—", dSt, "var(--c-stress)");
  renderSleep(today, 'sl-', 'slb-');
  const times = rows.map(r => r.updated_at).filter(Boolean).sort();
  if (times.length) {
    const d = new Date(times[times.length - 1]);
    document.getElementById("sync-footer").textContent =
      "↻ Last synced " + d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " · " +
      d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  rSetRange(state.rActiveDay);
}
