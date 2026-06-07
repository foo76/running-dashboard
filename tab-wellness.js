import { state, localDate, rmSk, scoreRow } from './shared.js';

export const wellnessHTML = `
  <div class="sync-row" id="sync-time"></div>
  <div class="metrics-grid">
    <div class="metric-card hrv tappable" onclick="toggleHrvMode()">
      <span class="metric-label">HRV</span>
      <div class="metric-value-wrap">
        <span class="metric-value sk" id="hrv-val">—</span>
        <span class="metric-unit">ms</span>
        <span class="metric-arrow" id="hrv-arrow"></span>
      </div>
      <div class="hrv-mode-label" id="hrv-mode-label">LAST NIGHT</div>
    </div>
    <div class="metric-card rhr">
      <span class="metric-label">Resting HR</span>
      <div class="metric-value-wrap">
        <span class="metric-value sk" id="rhr-val">—</span>
        <span class="metric-unit">bpm</span>
      </div>
    </div>
    <div class="metric-card sleep">
      <span class="metric-label">Sleep Score</span>
      <div class="metric-value-wrap">
        <span class="metric-value sk" id="sleep-val">—</span>
        <span class="metric-unit">/100</span>
      </div>
    </div>
  </div>

  <div class="chart-panel">
    <div class="w-range-wrap">
      <button class="w-range-btn active" data-d="7"  onclick="wSetRange(7)">7D</button>
      <button class="w-range-btn"        data-d="14" onclick="wSetRange(14)">14D</button>
      <button class="w-range-btn"        data-d="30" onclick="wSetRange(30)">30D</button>
    </div>
    <div class="chart-inner">
      <div class="chart-skel sk" id="chart-skel"></div>
      <div id="w-chart-wrap"></div>
    </div>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-hrv)"></div><span id="legend-hrv-label">HRV</span></div>
      <div class="legend-item"><div class="legend-dash" style="border-color:var(--c-hrv)"></div><span>Baseline</span></div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-rhr)"></div><span>RHR</span></div>
      <div class="legend-item"><div class="legend-dot" style="background:#7B9EFF"></div><span>Sleep</span></div>
    </div>
  </div>
`;

export function renderWellness(rows) {
  const container = document.getElementById('panel-wellness');
  if (container.innerHTML.trim() === '') {
    container.innerHTML = wellnessHTML;
  }

  const todayStr = localDate(0);
  const today = rows.find(r => r.date === todayStr) || rows[rows.length - 1];
  if (!today) return;

  rmSk("hrv-val");
  const rhrVal = rmSk("rhr-val"); if (rhrVal) rhrVal.textContent = today.resting_hr || "—";
  const slpVal = rmSk("sleep-val"); if (slpVal) slpVal.textContent = today.sleep_score || "—";

  applyHrvMode(rows);

  const syncEl = document.getElementById("sync-time");
  if (syncEl && today.updated_at) {
    const d = new Date(today.updated_at);
    syncEl.textContent = "Updated " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  wSetRange(state.wActiveDay);
}

export function applyHrvMode(rows = state.allRows) {
  const isAvg = (state.hrvMode === 'weekly_avg');
  const todayStr = localDate(0), yestStr = localDate(1);
  const today = rows.find(r => r.date === todayStr) || rows[rows.length - 1];
  const yest  = rows.find(r => r.date === yestStr)  || (rows.length >= 2 ? rows[rows.length - 2] : null);

  const valEl    = document.getElementById('hrv-val');
  const arrowEl  = document.getElementById('hrv-arrow');
  const modeEl   = document.getElementById('hrv-mode-label');
  const legendEl = document.getElementById('legend-hrv-label');

  if (!valEl) return;

  if (isAvg) {
    const avg = today ? parseFloat(today.hrv_weekly_avg) : null;
    valEl.textContent    = (avg !== null && !isNaN(avg)) ? avg.toFixed(1) : '—';
    valEl.style.color    = 'var(--c-hrv)';
    arrowEl.textContent  = '';
    modeEl.textContent   = '7D AVG';
    legendEl.textContent = 'HRV 7D';
  } else {
    const hrv  = today ? parseFloat(today.hrv_last_night) : null;
    const hrvP = yest  ? parseFloat(yest.hrv_last_night)  : null;
    const dir  = (hrv && hrvP && !isNaN(hrv) && !isNaN(hrvP)) ? (hrv >= hrvP ? '↑' : '↓') : null;
    valEl.textContent  = (hrv !== null && !isNaN(hrv)) ? hrv.toFixed(1) : '—';
    valEl.style.color  = (!dir || dir === '↑') ? '#00D4C8' : '#FF5A6E';
    if (dir) {
      arrowEl.textContent = dir;
      arrowEl.className   = 'metric-arrow ' + (dir === '↑' ? 'good' : 'bad');
    } else {
      arrowEl.textContent = '';
    }
    modeEl.textContent   = 'LAST NIGHT';
    legendEl.textContent = 'HRV';
  }
}

export function toggleHrvMode() {
  if (!state.allRows.length) return;
  state.hrvMode = (state.hrvMode === 'last_night') ? 'weekly_avg' : 'last_night';
  applyHrvMode();
  wSetRange(state.wActiveDay);
}
window.toggleHrvMode = toggleHrvMode;

export function wSetRange(days) {
  state.wActiveDay = days;
  document.querySelectorAll(".w-range-btn").forEach(b => b.classList.toggle("active", +b.dataset.d === days));
  wDrawChart(state.allRows.slice(-days));
}
window.wSetRange = wSetRange;

export function wDrawChart(rows) {
  const wrap = document.getElementById("w-chart-wrap");
  if (!wrap) return;
  d3.select("#w-chart-wrap").selectAll("*").remove();
  rmSk("chart-skel");

  const W = wrap.clientWidth || 340, H = wrap.clientHeight || 150;
  const pT = 10, pB = 20, pL = 30, pR = 10;

  const hrvKey   = (state.hrvMode === 'weekly_avg') ? 'hrv_weekly_avg' : 'hrv_last_night';
  const hrvs     = rows.map(r => parseFloat(r[hrvKey])).filter(v => !isNaN(v));
  const rhrs     = rows.map(r => parseFloat(r.resting_hr)).filter(v => !isNaN(v));
  const slps     = rows.map(r => parseFloat(r.sleep_score)).filter(v => !isNaN(v));

  if (!hrvs.length && !rhrs.length && !slps.length) return;

  const minH = hrvs.length ? Math.min(...hrvs) : 40;
  const maxH = hrvs.length ? Math.max(...hrvs) : 80;
  const minR = rhrs.length ? Math.min(...rhrs) : 40;
  const maxR = rhrs.length ? Math.max(...rhrs) : 80;
  const minS = slps.length ? Math.min(...slps) : 40;
  const maxS = slps.length ? Math.max(...slps) : 100;
  const minV = Math.min(minH, minR, minS) - 5;
  const maxV = Math.max(maxH, maxR, maxS) + 5;

  const xS = d3.scaleLinear().domain([0, rows.length - 1]).range([pL, W - pR]);
  const yS = d3.scaleLinear().domain([minV, maxV]).range([H - pB, pT]);

  const svg = d3.select("#w-chart-wrap").append("svg").attr("viewBox", `0 0 ${W} ${H}`);

  // Grid lines
  yS.ticks(5).forEach(t => {
    svg.append("line")
       .attr("x1", pL).attr("x2", W - pR).attr("y1", yS(t)).attr("y2", yS(t))
       .attr("stroke", "var(--border)").attr("stroke-width", 0.5).attr("stroke-dasharray", "2,2");
    svg.append("text")
       .attr("x", pL - 5).attr("y", yS(t) + 3).attr("text-anchor", "end")
       .attr("font-size", "8px").attr("fill", "var(--dim)").text(t);
  });

  // Single reusable line generator
  const line = d3.line()
    .defined(d => !isNaN(d.v))
    .x((d, i) => xS(i))
    .y(d => yS(d.v))
    .curve(d3.curveMonotoneX);

  // Baseline (HRV weekly avg dashed)
  const baseData = rows.map(r => ({ v: parseFloat(r.hrv_weekly_avg) }));
  svg.append("path").datum(baseData).attr("d", line).attr("fill", "none")
     .attr("stroke", "var(--c-hrv)").attr("stroke-width", 1.5).attr("stroke-dasharray", "4,3").attr("opacity", 0.4);

  // HRV line
  const hrvData = rows.map(r => ({ v: parseFloat(r[hrvKey]) }));
  svg.append("path").datum(hrvData).attr("d", line).attr("fill", "none")
     .attr("stroke", "var(--c-hrv)").attr("stroke-width", 2.5).attr("stroke-linecap", "round");

  // RHR line
  const rhrData = rows.map(r => ({ v: parseFloat(r.resting_hr) }));
  svg.append("path").datum(rhrData).attr("d", line).attr("fill", "none")
     .attr("stroke", "var(--c-rhr)").attr("stroke-width", 2).attr("stroke-linecap", "round").attr("opacity", 0.8);

  // Sleep Score line
  const sleepData = rows.map(r => ({ v: parseFloat(r.sleep_score) }));
  svg.append("path").datum(sleepData).attr("d", line).attr("fill", "none")
     .attr("stroke", "#7B9EFF").attr("stroke-width", 2).attr("stroke-linecap", "round").attr("opacity", 0.8);

  // End point dots
  const lastIdx = rows.length - 1;
  if (lastIdx >= 0 && !isNaN(hrvData[lastIdx].v)) {
    svg.append("circle").attr("cx", xS(lastIdx)).attr("cy", yS(hrvData[lastIdx].v)).attr("r", 3.5).attr("fill", "var(--c-hrv)");
  }
  if (lastIdx >= 0 && !isNaN(rhrData[lastIdx].v)) {
    svg.append("circle").attr("cx", xS(lastIdx)).attr("cy", yS(rhrData[lastIdx].v)).attr("r", 3).attr("fill", "var(--c-rhr)");
  }
  if (lastIdx >= 0 && !isNaN(sleepData[lastIdx].v)) {
    svg.append("circle").attr("cx", xS(lastIdx)).attr("cy", yS(sleepData[lastIdx].v)).attr("r", 3).attr("fill", "#7B9EFF");
  }

  // Date labels
  const every = rows.length > 14 ? 5 : 2;
  rows.forEach((r, i) => {
    if (i % every === 0 || i === rows.length - 1) {
      const d = new Date(r.date + "T12:00:00");
      svg.append("text").attr("x", xS(i)).attr("y", H - 4).attr("text-anchor", "middle")
         .attr("font-size", "7.5px").attr("fill", "var(--dim)").text(d.getDate() + "/" + (d.getMonth() + 1));
    }
  });
}
