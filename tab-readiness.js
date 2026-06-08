import { state, SB_URL, SB_KEY } from './shared.js';

// ─────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────
const PERIODS = [
  { label: '7 Days',  days: 7  },
  { label: '30 Days', days: 30 },
  { label: '60 Days', days: 60 }
];
const DEFAULT_DAYS = 7;

// Exertion normalisation anchor: weighted_exertion_s that = 10.0
// Based on your data: ~10,000s weighted = very hard day (e.g. 3hr Z2 run)
// Adjust this if your scale feels off
const EXERTION_MAX_S = 10000;

// Training goal affects lower bound of target band
const TRAINING_GOALS = {
  tapering:  { low: 0.10, high: 0.35 },
  moderate:  { low: 0.20, high: 0.55 },
  building:  { low: 0.30, high: 0.65 },
  peak:      { low: 0.40, high: 0.75 }
};
const DEFAULT_GOAL = 'moderate';

const C_RECOVERY = '#C0C8D8';
const C_EXERTION = '#3B9EFF';
const C_BAND     = 'rgba(110,120,155,0.22)';
const C_GREEN    = '#4ADE80';
const C_AMBER    = '#F59E0B';
const C_RED      = '#F87171';

const STATUS_META = {
  BALANCED:   { color: C_GREEN, label: 'Balanced',   msg: 'Good job listening to your body and planning your training accordingly.' },
  UNBALANCED: { color: C_AMBER, label: 'Unbalanced', msg: 'Your exertion is not well matched to your recovery. Consider adjusting your training load.' },
  LOW:        { color: C_RED,   label: 'Low',        msg: 'Your recovery is low. Prioritise rest, sleep and easy activity today.' },
  UNKNOWN:    { color: C_AMBER, label: 'Unknown',    msg: 'Not enough data to assess your balance today.' }
};

let rs = { activeDays: DEFAULT_DAYS, computed: [], fetched: false };

// ─────────────────────────────────────────────────────────
// RECOVERY: HRV + RHR vs 60-day rolling baseline
// HRV weighted 60%, RHR weighted 40%
// Returns 0–100
// ─────────────────────────────────────────────────────────
function computeRecovery(wellnessRows) {
  return wellnessRows.map((row, idx) => {
    // 60-day window ending the day before this date
    const windowStart = idx >= 60 ? idx - 60 : 0;
    const window = wellnessRows.slice(windowStart, idx);

    const hrvVals = window.map(r => +r.hrv_last_night).filter(v => v > 0);
    const rhrVals = window.map(r => r.resting_hr).filter(v => v > 0);

    const avgHRV = hrvVals.length ? hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length : 0;
    const avgRHR = rhrVals.length ? rhrVals.reduce((a, b) => a + b, 0) / rhrVals.length : 0;

    const todayHRV = +row.hrv_last_night || 0;
    const todayRHR = row.resting_hr || 0;

    let recovery = 50; // default if no baseline yet

    if (avgHRV > 0 && avgRHR > 0 && window.length >= 7) {
      // HRV ratio: today vs baseline. Cap at 1.5x (very high HRV) → 1.0 normalised
      const hrvRatio = Math.min(todayHRV / avgHRV, 1.5) / 1.5;
      // RHR ratio: lower today = better. Cap at 0.75x baseline (very low RHR) → 1.0 normalised
      const rhrRatio = Math.min(avgRHR / Math.max(todayRHR, 25), 1.33) / 1.33;
      // Weighted composite → 0–100
      recovery = Math.round((hrvRatio * 0.60 + rhrRatio * 0.40) * 100);
    } else if (window.length < 7) {
      // Not enough history yet — use simpler single-day estimate
      if (todayHRV > 0) recovery = Math.min(100, Math.round((todayHRV / 50) * 70)); // 50ms HRV ≈ 70
    }

    return { ...row, recovery: Math.min(100, Math.max(0, recovery)) };
  });
}

// ─────────────────────────────────────────────────────────
// EXERTION: weighted_exertion_s → 0–10
// ─────────────────────────────────────────────────────────
function computeExertion(exertionRows) {
  // Rolling 30-day max for dynamic ceiling
  return exertionRows.map((row, idx) => {
    const windowStart = Math.max(0, idx - 30);
    const window = exertionRows.slice(windowStart, idx + 1);
    const rolling30Max = Math.max(...window.map(r => r.weighted_exertion_s || 0), EXERTION_MAX_S);
    const ex = Math.min(10, Math.max(0, +((row.weighted_exertion_s || 0) / rolling30Max * 10).toFixed(2)));
    return { ...row, exertion: ex };
  });
}

// ─────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────
async function fetchData() {
  const since = new Date();
  since.setDate(since.getDate() - 95); // 95 days: 60 baseline + 35 buffer
  const sinceStr = since.toISOString().slice(0, 10);

  const [wellnessRes, exertionRes] = await Promise.all([
    fetch(SB_URL + '/rest/v1/wellness_daily?select=date,hrv_last_night,hrv_weekly_avg,resting_hr,hrv_status,sleep_score&date=gte.' + sinceStr + '&order=date.asc&limit=100', {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
    }),
    fetch(SB_URL + '/rest/v1/daily_exertion?select=date,total_moving_s,mean_hr,peak_hr,hrr_pct,weighted_exertion_s,resting_hr,max_hr_zone,hr_reserve&date=gte.' + sinceStr + '&order=date.asc&limit=100', {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
    })
  ]);

  if (!wellnessRes.ok) throw new Error('Wellness fetch failed: ' + wellnessRes.status);
  if (!exertionRes.ok) throw new Error('Exertion fetch failed: ' + exertionRes.status);

  const [wellness, exertion] = await Promise.all([wellnessRes.json(), exertionRes.json()]);
  return { wellness, exertion };
}

// ─────────────────────────────────────────────────────────
// MERGE wellness + exertion by date
// ─────────────────────────────────────────────────────────
function mergeData(wellness, exertion) {
  const exMap = {};
  exertion.forEach(e => { exMap[e.date] = e; });

  const withRecovery = computeRecovery(wellness);

  return withRecovery.map(w => {
    const ex = exMap[w.date] || {};
    return {
      date:             w.date,
      recovery:         w.recovery,             // 0–100
      hrv_status:       w.hrv_status,
      hrv_last_night:   +w.hrv_last_night || 0,
      resting_hr:       w.resting_hr || 0,
      sleep_score:      w.sleep_score || 0,
      weighted_exertion_s: ex.weighted_exertion_s || 0,
      mean_hr:          ex.mean_hr || 0,
      total_moving_s:   ex.total_moving_s || 0,
      hrr_pct:          +ex.hrr_pct || 0
    };
  });
}

// ─────────────────────────────────────────────────────────
// TARGET BAND based on recovery + training goal
// Returns { min, max } on 0–10 exertion scale
// ─────────────────────────────────────────────────────────
function targetBand(recovery100, goal = DEFAULT_GOAL) {
  const rec = recovery100 / 100;
  const g = TRAINING_GOALS[goal] || TRAINING_GOALS.moderate;
  return {
    min: +(rec * g.low  * 10).toFixed(2),
    max: +(rec * g.high * 10).toFixed(2)
  };
}

// ─────────────────────────────────────────────────────────
// CATMULL-ROM SMOOTH PATH
// ─────────────────────────────────────────────────────────
function smoothPath(pts) {
  if (pts.length < 2) return 'M ' + pts.map(p => `${p.x} ${p.y}`).join(' L ');
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function smoothArea(topPts, botPts) {
  const top = smoothPath(topPts);
  const rev = [...botPts].reverse();
  let bot = ` L ${rev[0].x.toFixed(2)} ${rev[0].y.toFixed(2)}`;
  for (let i = 0; i < rev.length - 1; i++) {
    const p0 = rev[Math.max(i - 1, 0)];
    const p1 = rev[i];
    const p2 = rev[i + 1];
    const p3 = rev[Math.min(i + 2, rev.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    bot += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return top + bot + ' Z';
}

// ─────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('readiness-styles')) return;
  const s = document.createElement('style');
  s.id = 'readiness-styles';
  s.textContent = `
    #panel-readiness {
      padding: 20px 18px 32px;
      display: flex; flex-direction: column; gap: 0;
      background: var(--bg, #0D1117); min-height: 100%;
    }
    .re-title {
      font-size: 1.45rem; font-weight: 800; color: #CDD8EE;
      margin-bottom: 16px; letter-spacing: -.01em;
    }
    .re-period-wrap {
      display: flex; background: #161D2E; border: 1px solid #1E2A42;
      border-radius: 14px; padding: 3px; gap: 2px; margin-bottom: 22px;
    }
    .re-period-btn {
      flex: 1; padding: 9px 4px; font-size: .74rem; font-weight: 700;
      border: none; border-radius: 11px; background: transparent; color: #5A6A88;
      cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent;
      transition: all 200ms; text-align: center;
    }
    .re-period-btn.active {
      background: #232E48; color: #CDD8EE; box-shadow: 0 2px 10px rgba(0,0,0,.5);
    }
    .re-card {
      background: #0E1525; border: 1px solid #1A2640; border-radius: 18px;
      padding: 20px 12px 16px; display: flex; flex-direction: column;
      gap: 16px; margin-bottom: 18px;
    }
    .re-chart-outer {
      width: 100%; height: 340px; position: relative;
    }
    .re-chart-outer svg {
      position: absolute; inset: 0; width: 100%; height: 100%;
      display: block; overflow: visible;
    }
    .re-legend {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; padding: 0 4px;
    }
    .re-legend-item {
      display: flex; align-items: center; gap: 8px;
      font-size: .69rem; color: #8898BB; font-weight: 500;
    }
    .re-leg-line { width: 24px; height: 3px; border-radius: 2px; flex-shrink: 0; }
    .re-leg-box  { width: 16px; height: 11px; border-radius: 3px; background: rgba(110,120,150,0.4); flex-shrink: 0; }
    .re-status-block { padding: 4px 2px 0; }
    .re-status-label { font-size: 1.1rem; font-weight: 800; margin-bottom: 5px; }
    .re-status-msg   { font-size: .82rem; color: #8898BB; line-height: 1.5; }
    .re-tt {
      position: fixed; pointer-events: none; opacity: 0;
      background: rgba(10,14,26,0.97); border: 1px solid #1E2A42; border-radius: 12px;
      padding: 10px 14px; z-index: 9999; box-shadow: 0 8px 32px rgba(0,0,0,.8);
      transition: opacity 120ms ease; min-width: 185px; backdrop-filter: blur(8px);
    }
    .re-tt.vis { opacity: 1; }
    .rett-date {
      font-size: .65rem; font-weight: 700; color: #CDD8EE;
      margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #1E2A42;
    }
    .rett-row {
      display: flex; justify-content: space-between; gap: 16px;
      font-size: .7rem; color: #5A6A88; margin-bottom: 3px; font-weight: 600;
    }
    .rett-divider {
      border: none; border-top: 1px solid #1E2A42; margin: 5px 0;
    }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────
// DRAW CHART
// ─────────────────────────────────────────────────────────
function drawChart(allData, days, goal = DEFAULT_GOAL) {
  const outer = document.getElementById('re-chart-outer');
  if (!outer) return;
  const old = outer.querySelector('svg');
  if (old) old.remove();

  const W = outer.clientWidth  || 340;
  const H = outer.clientHeight || 340;
  const pL = 38, pR = 50, pT = 28, pB = 30;
  const cW = W - pL - pR;
  const cH = H - pT - pB;

  // Slice to selected window
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutStr = cutoff.toISOString().slice(0, 10);
  const vis = allData.filter(d => d.date >= cutStr);
  if (!vis.length) return;

  // Compute exertion for visible window + rolling 30d context
  const contextStart = new Date(cutoff);
  contextStart.setDate(contextStart.getDate() - 30);
  const contextStr = contextStart.toISOString().slice(0, 10);
  const context = allData.filter(d => d.date >= contextStr);
  const withEx = computeExertion(context);
  // Re-slice to visible window
  const data = withEx.filter(d => d.date >= cutStr);
  const n = data.length;
  if (!n) return;

  const showLabels = days <= 7;
  const labelEvery = days <= 7 ? 1 : days <= 30 ? 4 : 7;

  // Recovery on top track (0–100 → map to top 22% of chart)
  const recTrackH = Math.round(cH * 0.20);
  const recTop = pT, recBot = pT + recTrackH;
  const exTop  = recBot + 6, exBot = H - pB;
  const exH    = exBot - exTop;

  const xS   = i  => pL + (i / Math.max(n - 1, 1)) * cW;
  const yRec = v  => recTop + ((100 - v) / 100) * recTrackH;  // v = 0–100
  const yEx  = v  => exBot  - (v / 10) * exH;                 // v = 0–10

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  Object.assign(svg.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', overflow:'visible' });
  const mk = (tag, attrs, txt) => {
    const el = document.createElementNS(ns, tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    if (txt !== undefined) el.textContent = txt;
    return el;
  };

  // ── Recovery track background ──
  svg.appendChild(mk('rect', {
    x:pL, y:recTop, width:cW, height:recTrackH,
    fill:'rgba(255,255,255,0.02)', rx:'3'
  }));
  svg.appendChild(mk('line', {
    x1:pL, x2:W-pR, y1:recBot+3, y2:recBot+3,
    stroke:'rgba(255,255,255,0.07)', 'stroke-width':'1'
  }));

  // ── Y axis ticks — exertion track ──
  const exTicks = [
    { v:10,  lL:'10.0', lR:'100%', rc: C_GREEN    },
    { v:6.6, lL:'6.6',  lR:'66%',  rc: C_EXERTION },
    { v:3.3, lL:'3.3',  lR:'33%',  rc: C_AMBER    },
    { v:0,   lL:'0.0',  lR:'0%',   rc: C_RED      }
  ];
  exTicks.forEach(t => {
    const y = yEx(t.v);
    if (y < exTop) return;
    svg.appendChild(mk('line', { x1:pL, x2:W-pR, y1:y, y2:y, stroke:'rgba(255,255,255,0.07)', 'stroke-width':'1' }));
    svg.appendChild(mk('text', { x:pL-6,   y:y+3.5, 'font-size':'9.5', fill:'#3B9EFF', 'text-anchor':'end',   'font-weight':'700' }, t.lL));
    svg.appendChild(mk('text', { x:W-pR+6, y:y+3.5, 'font-size':'9.5', fill:t.rc,      'text-anchor':'start', 'font-weight':'700' }, t.lR));
  });

  // ── X axis labels + dashed verticals ──
  data.forEach((d, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return;
    const x = xS(i);
    svg.appendChild(mk('line', {
      x1:x, x2:x, y1:recTop, y2:exBot,
      stroke:'rgba(255,255,255,0.06)', 'stroke-dasharray':'3,3', 'stroke-width':'1'
    }));
    const dt = new Date(d.date + 'T12:00:00');
    const lbl = days <= 7
      ? dt.toLocaleDateString('en-GB', { weekday:'short' })
      : dt.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
    svg.appendChild(mk('text', { x, y:H-pB+15, 'text-anchor':'middle', 'font-size':'9', fill:'rgba(255,255,255,0.3)' }, lbl));
  });

  // ── Target Exertion Band (smooth, based on recovery + goal) ──
  const bandTopPts = data.map((d, i) => ({ x: xS(i), y: yEx(targetBand(d.recovery, goal).max) }));
  const bandBotPts = data.map((d, i) => ({ x: xS(i), y: yEx(targetBand(d.recovery, goal).min) }));
  svg.appendChild(mk('path', { d: smoothArea(bandTopPts, bandBotPts), fill: C_BAND }));

  // ── Exertion line (smooth, blue) ──
  const exPts = data.map((d, i) => ({ x: xS(i), y: yEx(d.exertion) }));
  svg.appendChild(mk('path', { d: smoothPath(exPts), fill:'none', stroke: C_EXERTION, 'stroke-width':'2.5', 'stroke-linecap':'round' }));
  data.forEach((d, i) => {
    const cx = xS(i), cy = yEx(d.exertion);
    svg.appendChild(mk('circle', { cx, cy, r:'4.5', fill: C_EXERTION, stroke:'#0E1525', 'stroke-width':'2' }));
    if (showLabels || i % labelEvery === 0 || i === n - 1) {
      const labelY = cy > exBot - 18 ? cy - 8 : cy + 14;
      svg.appendChild(mk('text', { x:cx, y:labelY, 'text-anchor':'middle', 'font-size':'8.5', fill:'#fff', 'font-weight':'700' }, d.exertion.toFixed(1)));
    }
  });

  // ── Recovery line (smooth, grey) — in top track ──
  const recPts = data.map((d, i) => ({ x: xS(i), y: yRec(d.recovery) }));
  svg.appendChild(mk('path', { d: smoothPath(recPts), fill:'none', stroke: C_RECOVERY, 'stroke-width':'2', 'stroke-linecap':'round' }));
  data.forEach((d, i) => {
    const cx = xS(i), cy = yRec(d.recovery);
    const dc = d.hrv_status === 'BALANCED' ? C_GREEN : d.hrv_status === 'LOW' ? C_RED : C_AMBER;
    svg.appendChild(mk('circle', { cx, cy, r:'5', fill:dc, stroke:'#0E1525', 'stroke-width':'2' }));
    if (showLabels || i % labelEvery === 0 || i === n - 1) {
      const labelY = cy < recTop + 14 ? cy + 14 : cy - 8;
      svg.appendChild(mk('text', { x:cx, y:labelY, 'text-anchor':'middle', 'font-size':'8.5', fill:'#fff', 'font-weight':'700' }, d.recovery + '%'));
    }
  });

  // ── Hover overlay ──
  const vLine = mk('line', { y1:recTop, y2:exBot, stroke:'rgba(255,255,255,0.22)', 'stroke-width':'1', 'stroke-dasharray':'3,2' }); vLine.style.display='none';
  const hRDot = mk('circle', { r:'7', stroke:'#0E1525', 'stroke-width':'2', opacity:'0.9' }); hRDot.style.display='none';
  const hEDot = mk('circle', { r:'6', fill:C_EXERTION, stroke:'#0E1525', 'stroke-width':'2' }); hEDot.style.display='none';
  const overlay = mk('rect', { x:pL, y:recTop, width:cW, height:H-recTop-pB, fill:'transparent' });
  overlay.style.cursor = 'crosshair';
  [vLine, hRDot, hEDot, overlay].forEach(el => svg.appendChild(el));

  const tt = document.getElementById('re-tt');
  const showTip = (cx, cy, lx) => {
    const idx = Math.max(0, Math.min(n-1, Math.round(((lx - pL) / cW) * (n - 1))));
    const d   = data[idx];
    const band = targetBand(d.recovery, goal);
    const inBand = d.exertion >= band.min && d.exertion <= band.max;
    const exStatus = d.exertion > band.max ? '⬆️ Above target' : d.exertion < band.min ? '⬇️ Below target' : '✅ In target range';
    const movMins  = d.total_moving_s ? Math.round(d.total_moving_s / 60) + ' min' : '—';
    const hrrPct   = d.hrr_pct ? Math.round(d.hrr_pct * 100) + '%' : '—';

    vLine.setAttribute('x1', xS(idx)); vLine.setAttribute('x2', xS(idx)); vLine.style.display = '';
    hRDot.setAttribute('cx', xS(idx)); hRDot.setAttribute('cy', yRec(d.recovery));
    hRDot.setAttribute('fill', d.hrv_status === 'BALANCED' ? C_GREEN : d.hrv_status === 'LOW' ? C_RED : C_AMBER); hRDot.style.display = '';
    hEDot.setAttribute('cx', xS(idx)); hEDot.setAttribute('cy', yEx(d.exertion)); hEDot.style.display = '';

    const dls = new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'short' });
    tt.innerHTML = `
      <div class="rett-date">${dls}</div>
      <div class="rett-row"><span style="color:${C_RECOVERY}">Recovery</span><span style="color:#CDD8EE;font-weight:900">${d.recovery}%</span></div>
      <div class="rett-row"><span style="color:#5A6A88">HRV</span><span style="color:#8898BB">${d.hrv_last_night ? d.hrv_last_night.toFixed(0)+'ms' : '—'}</span></div>
      <div class="rett-row"><span style="color:#5A6A88">Resting HR</span><span style="color:#8898BB">${d.resting_hr || '—'} bpm</span></div>
      <hr class="rett-divider"/>
      <div class="rett-row"><span style="color:${C_EXERTION}">Exertion</span><span style="color:#CDD8EE;font-weight:900">${d.exertion.toFixed(1)}</span></div>
      <div class="rett-row"><span style="color:#5A6A88">Avg HR</span><span style="color:#8898BB">${d.mean_hr ? Math.round(d.mean_hr)+' bpm' : '—'}</span></div>
      <div class="rett-row"><span style="color:#5A6A88">HR Reserve used</span><span style="color:#8898BB">${hrrPct}</span></div>
      <div class="rett-row"><span style="color:#5A6A88">Moving time</span><span style="color:#8898BB">${movMins}</span></div>
      <hr class="rett-divider"/>
      <div class="rett-row"><span style="color:#5A6A88">Target band</span><span style="color:#8898BB">${band.min.toFixed(1)}–${band.max.toFixed(1)}</span></div>
      <div class="rett-row" style="font-size:.62rem"><span style="color:#8898BB">${exStatus}</span></div>
    `;
    tt.style.left = Math.min(cx + 14, window.innerWidth - 205) + 'px';
    tt.style.top  = Math.max(8, cy - 100) + 'px';
    tt.classList.add('vis');
  };

  overlay.addEventListener('mousemove',  e => { const r = svg.getBoundingClientRect(); showTip(e.clientX, e.clientY, e.clientX - r.left); });
  overlay.addEventListener('touchmove',  e => { e.preventDefault(); const r = svg.getBoundingClientRect(); const t = e.touches[0]; showTip(t.clientX, t.clientY, t.clientX - r.left); }, { passive:false });
  overlay.addEventListener('mouseleave', () => { vLine.style.display='none'; hRDot.style.display='none'; hEDot.style.display='none'; tt.classList.remove('vis'); });

  outer.appendChild(svg);
}

// ─────────────────────────────────────────────────────────
// STATUS BLOCK
// ─────────────────────────────────────────────────────────
function updateStatus(data, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const vis = data.filter(d => d.date >= cutoff.toISOString().slice(0, 10));
  if (!vis.length) return;
  const today = vis[vis.length - 1];
  const meta  = STATUS_META[today.hrv_status] || STATUS_META.UNKNOWN;
  const le = document.getElementById('re-status-label');
  const me = document.getElementById('re-status-msg');
  if (le) { le.textContent = meta.label; le.style.color = meta.color; }
  if (me) me.textContent = meta.msg;
}

// ─────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────
export function readinessSetPeriod(days) {
  rs.activeDays = days;
  document.querySelectorAll('.re-period-btn').forEach(b =>
    b.classList.toggle('active', +b.dataset.d === days));
  if (rs.computed.length) {
    drawChart(rs.computed, days);
    updateStatus(rs.computed, days);
  }
}
window.readinessSetPeriod = readinessSetPeriod;

export async function renderReadiness() {
  injectStyles();
  const container = document.getElementById('panel-readiness');
  container.innerHTML = `
    <div class="re-title">Recovery vs. Exertion</div>
    <div class="re-period-wrap">
      ${PERIODS.map(p => `<button class="re-period-btn${p.days === DEFAULT_DAYS ? ' active' : ''}" data-d="${p.days}" onclick="readinessSetPeriod(${p.days})">${p.label}</button>`).join('')}
    </div>
    <div class="re-card">
      <div class="re-chart-outer" id="re-chart-outer"></div>
      <div class="re-legend">
        <div class="re-legend-item"><div class="re-leg-line" style="background:${C_RECOVERY}"></div>Recovery</div>
        <div class="re-legend-item"><div class="re-leg-box"></div>Target Exertion Range</div>
        <div class="re-legend-item"><div class="re-leg-line" style="background:${C_EXERTION}"></div>Exertion</div>
        <div class="re-legend-item" style="gap:6px">
          <div style="display:flex;gap:3px;align-items:center">
            <div style="width:9px;height:9px;border-radius:50%;background:${C_GREEN}"></div>
            <div style="width:9px;height:9px;border-radius:50%;background:${C_AMBER}"></div>
            <div style="width:9px;height:9px;border-radius:50%;background:${C_RED}"></div>
          </div>HRV Status
        </div>
      </div>
    </div>
    <div class="re-status-block">
      <div class="re-status-label" id="re-status-label">—</div>
      <div class="re-status-msg"   id="re-status-msg"></div>
    </div>
    <div id="re-tt" class="re-tt"></div>
  `;

  try {
    if (!rs.fetched) {
      const { wellness, exertion } = await fetchData();
      rs.computed = mergeData(wellness, exertion);
      rs.fetched  = true;
    }

    if (!rs.computed.length) {
      document.getElementById('re-chart-outer').innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#5A6A88;font-size:.8rem;">No readiness data</div>';
      return;
    }

    updateStatus(rs.computed, rs.activeDays);

    const outer = document.getElementById('re-chart-outer');
    if (outer.clientWidth > 0) {
      drawChart(rs.computed, rs.activeDays);
    } else {
      const ro = new ResizeObserver(entries => {
        for (const e of entries) {
          if (e.contentRect.width > 0) { ro.disconnect(); drawChart(rs.computed, rs.activeDays); }
        }
      });
      ro.observe(outer);
    }
  } catch (e) {
    console.error(e);
    document.getElementById('panel-readiness').innerHTML =
      `<div style="padding:24px;text-align:center;color:#F87171;font-size:.8rem;">⚠️ ${e.message}</div>`;
  }
}
