import { state, SB_URL, SB_KEY } from './shared.js';

const PERIODS = [
  { label: '7 Days',  days: 7  },
  { label: '30 Days', days: 30 },
  { label: '60 Days', days: 60 }
];
const DEFAULT_DAYS = 7;

const C_RECOVERY = '#C0C8D8';   // muted grey-white
const C_EXERTION = '#3B9EFF';   // electric blue
const C_BAND     = 'rgba(110,120,150,0.22)';
const C_GREEN    = '#4ADE80';
const C_AMBER    = '#F59E0B';
const C_RED      = '#F87171';
const C_AXIS_L   = '#3B9EFF';   // left axis blue
const C_AXIS_R_HIGH = C_GREEN;
const C_AXIS_R_MID  = C_EXERTION;
const C_AXIS_R_LOW  = C_AMBER;
const C_AXIS_R_ZERO = C_RED;

const STATUS_META = {
  BALANCED:   { color: C_GREEN, label: 'Balanced',   msg: 'Good job listening to your body and planning your training accordingly.' },
  UNBALANCED: { color: C_AMBER, label: 'Unbalanced', msg: 'Your exertion is not well matched to your recovery. Consider adjusting your training load.' },
  LOW:        { color: C_RED,   label: 'Low',        msg: 'Your recovery is low. Prioritise rest, sleep and easy activity today.' },
  UNKNOWN:    { color: C_AMBER, label: 'Unknown',    msg: 'Not enough data to assess your balance today.' }
};

const dotColor = s => {
  if (!s) return C_AMBER;
  const u = s.toUpperCase();
  if (u === 'BALANCED') return C_GREEN;
  if (u === 'LOW')      return C_RED;
  return C_AMBER;
};

let rs = { activeDays: DEFAULT_DAYS, rows: [], fetched: false };

// ── Recovery composite score (0–10) ──────────────────────
// Uses sleep_score, body_battery_low (how depleted you got), hrv_status
// body_battery_low = how low battery fell during the day → low value = more depleted
function calcRecovery(row) {
  const sleep   = (row.sleep_score || 70) / 100;                // 0–1
  const battery = (row.body_battery_low || 30) / 100;           // 0–1, higher = less depleted
  const hrv     = row.hrv_status === 'BALANCED' ? 1.0
                : row.hrv_status === 'UNBALANCED' ? 0.6
                : row.hrv_status === 'LOW' ? 0.3
                : 0.7;
  // Weighted composite
  const raw = sleep * 0.45 + battery * 0.35 + hrv * 0.20;
  return Math.min(10, Math.max(0, +(raw * 10).toFixed(2)));
}

// ── Exertion score (0–10) ─────────────────────────────────
// body_battery_drained normalised against rolling 90-day max
function calcExertion(row, drainMax) {
  const drained = row.body_battery_drained || 0;
  return Math.min(10, Math.max(0, +((drained / drainMax) * 10).toFixed(2)));
}

// ── Catmull-Rom smooth path ───────────────────────────────
function smoothPath(pts) {
  if (pts.length < 2) return pts.map(p => `${p.x},${p.y}`).join(' ');
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
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// ── Smooth filled area path ───────────────────────────────
function smoothArea(topPts, botPts, baseY) {
  const top = smoothPath(topPts);
  // bottom reversed for closed shape
  const revBot = [...botPts].reverse();
  let bot = '';
  for (let i = 0; i < revBot.length - 1; i++) {
    const p0 = revBot[Math.max(i - 1, 0)];
    const p1 = revBot[i];
    const p2 = revBot[i + 1];
    const p3 = revBot[Math.min(i + 2, revBot.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    bot += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return top + ` L ${revBot[0].x} ${revBot[0].y}` + bot + ' Z';
}

// ── Styles ────────────────────────────────────────────────
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
    .re-title { font-size:1.45rem; font-weight:800; color:#CDD8EE; margin-bottom:16px; letter-spacing:-.01em; }

    .re-period-wrap {
      display:flex; background:#161D2E; border:1px solid #1E2A42;
      border-radius:14px; padding:3px; gap:2px; margin-bottom:22px;
    }
    .re-period-btn {
      flex:1; padding:9px 4px; font-size:.74rem; font-weight:700; border:none;
      border-radius:11px; background:transparent; color:#5A6A88; cursor:pointer;
      font-family:inherit; -webkit-tap-highlight-color:transparent; transition:all 200ms; text-align:center;
    }
    .re-period-btn.active { background:#232E48; color:#CDD8EE; box-shadow:0 2px 10px rgba(0,0,0,.5); }

    .re-card {
      background:#0E1525; border:1px solid #1A2640; border-radius:18px;
      padding:20px 12px 16px; display:flex; flex-direction:column; gap:16px; margin-bottom:18px;
    }
    .re-chart-outer { width:100%; height:340px; position:relative; }
    .re-chart-outer svg { position:absolute; inset:0; width:100%; height:100%; display:block; overflow:visible; }

    .re-legend {
      display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; padding:0 4px;
    }
    .re-legend-item { display:flex; align-items:center; gap:8px; font-size:.69rem; color:#8898BB; font-weight:500; }
    .re-leg-line { width:24px; height:3px; border-radius:2px; flex-shrink:0; }
    .re-leg-box { width:16px; height:11px; border-radius:3px; background:rgba(110,120,150,0.4); flex-shrink:0; }

    .re-status-block { padding:4px 2px 0; }
    .re-status-label { font-size:1.1rem; font-weight:800; margin-bottom:5px; }
    .re-status-msg { font-size:.82rem; color:#8898BB; line-height:1.5; }

    .re-tt {
      position:fixed; pointer-events:none; opacity:0;
      background:rgba(10,14,26,0.97); border:1px solid #1E2A42; border-radius:12px;
      padding:10px 14px; z-index:9999; box-shadow:0 8px 32px rgba(0,0,0,.8);
      transition:opacity 120ms ease; min-width:175px; backdrop-filter:blur(8px);
    }
    .re-tt.vis { opacity:1; }
    .rett-date { font-size:.65rem; font-weight:700; color:#CDD8EE; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #1E2A42; }
    .rett-row { display:flex; justify-content:space-between; gap:16px; font-size:.7rem; color:#5A6A88; margin-bottom:3px; font-weight:600; }
  `;
  document.head.appendChild(s);
}

// ── Fetch ─────────────────────────────────────────────────
async function fetchReadiness() {
  const since = new Date();
  since.setDate(since.getDate() - 95); // 95 days for rolling max context
  const cols = 'date,body_battery_at_wake,body_battery_high,body_battery_low,body_battery_drained,body_battery_charged,hrv_status,sleep_score,stress_avg';
  const url = SB_URL + '/rest/v1/wellness_daily?select=' + cols +
    '&date=gte.' + since.toISOString().slice(0, 10) +
    '&order=date.asc&limit=100';
  const res = await fetch(url, { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } });
  if (!res.ok) throw new Error('Readiness fetch error ' + res.status);
  return res.json();
}

// ── Draw ──────────────────────────────────────────────────
function drawChart(rows, days) {
  const outer = document.getElementById('re-chart-outer');
  if (!outer) return;
  const old = outer.querySelector('svg');
  if (old) old.remove();

  const W = outer.clientWidth  || 340;
  const H = outer.clientHeight || 340;
  const pL = 38, pR = 48, pT = 32, pB = 32;
  const chartH = H - pT - pB;
  const chartW = W - pL - pR;

  // Slice to window
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutStr = cutoff.toISOString().slice(0, 10);
  const vis = rows.filter(r => r.date >= cutStr && r.body_battery_drained != null);
  if (!vis.length) return;
  const n = vis.length;
  const showLabels = days <= 7;
  const labelEvery = days <= 7 ? 1 : days <= 30 ? 4 : 7;

  // Rolling 90-day max drain for exertion normalisation
  const drainMax = Math.max(...rows.map(r => r.body_battery_drained || 0), 60);

  // Build computed scores
  const data = vis.map(r => ({
    ...r,
    rec: calcRecovery(r),
    ex:  calcExertion(r, drainMax)
  }));

  // Y/X helpers — single unified 0–10 scale for both lines
  const xS = i => pL + (i / Math.max(n - 1, 1)) * chartW;
  const yS = v => pT + ((10 - v) / 10) * chartH; // 10 → top, 0 → bottom

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

  // ── Y axis grid ticks ──
  const yTicks = [
    { v:10,  lLeft:'10.0', lRight:'100%', rc: C_AXIS_R_HIGH },
    { v:6.6, lLeft:'6.6',  lRight:'66%',  rc: C_AXIS_R_MID  },
    { v:3.3, lLeft:'3.3',  lRight:'33%',  rc: C_AXIS_R_LOW  },
    { v:0,   lLeft:'0.0',  lRight:'0%',   rc: C_AXIS_R_ZERO }
  ];
  yTicks.forEach(t => {
    const y = yS(t.v);
    svg.appendChild(mk('line', { x1:pL, x2:W-pR, y1:y, y2:y, stroke:'rgba(255,255,255,0.07)', 'stroke-width':'1' }));
    svg.appendChild(mk('text', { x:pL-6, y:y+3.5, 'font-size':'9.5', fill:C_AXIS_L, 'text-anchor':'end', 'font-weight':'700' }, t.lLeft));
    svg.appendChild(mk('text', { x:W-pR+6, y:y+3.5, 'font-size':'9.5', fill:t.rc, 'text-anchor':'start', 'font-weight':'700' }, t.lRight));
  });

  // ── X axis labels + dashed verticals ──
  data.forEach((d, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return;
    const x = xS(i);
    svg.appendChild(mk('line', { x1:x, x2:x, y1:pT, y2:H-pB, stroke:'rgba(255,255,255,0.07)', 'stroke-dasharray':'3,3', 'stroke-width':'1' }));
    const dt = new Date(d.date + 'T12:00:00');
    const lbl = days <= 7
      ? dt.toLocaleDateString('en-GB', { weekday:'short' })
      : dt.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
    svg.appendChild(mk('text', { x, y:H-pB+15, 'text-anchor':'middle', 'font-size':'9', fill:'rgba(255,255,255,0.3)' }, lbl));
  });

  // ── Target Exertion Band (smooth) ──
  // Band = 30–80% of recovery on the same 0–10 scale
  const bandTopPts = data.map((d, i) => ({ x: xS(i), y: yS(d.rec * 0.8) }));
  const bandBotPts = data.map((d, i) => ({ x: xS(i), y: yS(d.rec * 0.3) }));
  const bandPath = smoothArea(bandTopPts, bandBotPts);
  svg.appendChild(mk('path', { d: bandPath, fill: C_BAND }));

  // ── Recovery line (smooth, grey) ──
  const recPts = data.map((d, i) => ({ x: xS(i), y: yS(d.rec) }));
  svg.appendChild(mk('path', { d: smoothPath(recPts), fill:'none', stroke: C_RECOVERY, 'stroke-width':'2.5', 'stroke-linecap':'round', 'stroke-linejoin':'round' }));

  // Recovery dots + labels
  data.forEach((d, i) => {
    const cx = xS(i), cy = yS(d.rec);
    const dc = dotColor(d.hrv_status);
    svg.appendChild(mk('circle', { cx, cy, r:'5', fill:dc, stroke:'#0E1525', 'stroke-width':'2' }));
    if (showLabels || i % labelEvery === 0 || i === n - 1) {
      const pct = Math.round(d.rec * 10) + '%';
      // Place label above dot, flip below if near top
      const labelY = cy < pT + 18 ? cy + 16 : cy - 9;
      svg.appendChild(mk('text', { x:cx, y:labelY, 'text-anchor':'middle', 'font-size':'8.5', fill:'#FFFFFF', 'font-weight':'700' }, pct));
    }
  });

  // ── Exertion line (smooth, blue) ──
  const exPts = data.map((d, i) => ({ x: xS(i), y: yS(d.ex) }));
  svg.appendChild(mk('path', { d: smoothPath(exPts), fill:'none', stroke: C_EXERTION, 'stroke-width':'2.5', 'stroke-linecap':'round', 'stroke-linejoin':'round' }));

  // Exertion dots + value labels
  data.forEach((d, i) => {
    const cx = xS(i), cy = yS(d.ex);
    svg.appendChild(mk('circle', { cx, cy, r:'4.5', fill:C_EXERTION, stroke:'#0E1525', 'stroke-width':'2' }));
    if (showLabels || i % labelEvery === 0 || i === n - 1) {
      const val = d.ex.toFixed(1);
      const labelY = cy > H - pB - 18 ? cy - 8 : cy + 15;
      svg.appendChild(mk('text', { x:cx, y:labelY, 'text-anchor':'middle', 'font-size':'8.5', fill:'#FFFFFF', 'font-weight':'700' }, val));
    }
  });

  // ── Hover overlay ──
  const vLine = mk('line', { y1:pT, y2:H-pB, stroke:'rgba(255,255,255,0.22)', 'stroke-width':'1', 'stroke-dasharray':'3,2' }); vLine.style.display='none';
  const hRDot = mk('circle', { r:'7', stroke:'#0E1525', 'stroke-width':'2', opacity:'0.9' }); hRDot.style.display='none';
  const hEDot = mk('circle', { r:'6', fill:C_EXERTION, stroke:'#0E1525', 'stroke-width':'2' }); hEDot.style.display='none';
  const overlay = mk('rect', { x:pL, y:pT, width:chartW, height:chartH, fill:'transparent' });
  overlay.style.cursor = 'crosshair';
  [vLine, hRDot, hEDot, overlay].forEach(el => svg.appendChild(el));

  const tt = document.getElementById('re-tt');
  const showTip = (cx, cy, lx) => {
    const idx = Math.max(0, Math.min(n-1, Math.round(((lx-pL)/chartW)*(n-1))));
    const d = data[idx];
    const bandMin = +(d.rec * 0.3).toFixed(1);
    const bandMax = +(d.rec * 0.8).toFixed(1);
    const exStatus = d.ex > bandMax ? '⬆️ Above target' : d.ex < bandMin ? '⬇️ Below target' : '✅ In target range';

    vLine.setAttribute('x1', xS(idx)); vLine.setAttribute('x2', xS(idx)); vLine.style.display='';
    hRDot.setAttribute('cx', xS(idx)); hRDot.setAttribute('cy', yS(d.rec));
    hRDot.setAttribute('fill', dotColor(d.hrv_status)); hRDot.style.display='';
    hEDot.setAttribute('cx', xS(idx)); hEDot.setAttribute('cy', yS(d.ex)); hEDot.style.display='';

    const dls = new Date(d.date+'T12:00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'short' });
    tt.innerHTML = `
      <div class="rett-date">${dls}</div>
      <div class="rett-row"><span style="color:${C_RECOVERY}">Recovery</span><span style="color:#CDD8EE;font-weight:900">${Math.round(d.rec*10)}% (${d.rec.toFixed(1)})</span></div>
      <div class="rett-row"><span style="color:${C_EXERTION}">Exertion</span><span style="color:#CDD8EE;font-weight:900">${d.ex.toFixed(1)}</span></div>
      <div class="rett-row"><span style="color:#5A6A88">Target band</span><span style="color:#8898BB">${bandMin}–${bandMax}</span></div>
      <div class="rett-row" style="margin-top:4px;font-size:.62rem"><span style="color:#8898BB">${exStatus}</span></div>
      <div class="rett-row"><span style="color:#5A6A88">Sleep</span><span style="color:#8898BB">${d.sleep_score ?? '—'}</span></div>
      <div class="rett-row"><span style="color:#5A6A88">Battery low</span><span style="color:#8898BB">${d.body_battery_low ?? '—'}</span></div>
    `;
    tt.style.left = Math.min(cx+14, window.innerWidth-195)+'px';
    tt.style.top  = Math.max(8, cy-90)+'px';
    tt.classList.add('vis');
  };

  overlay.addEventListener('mousemove', e => { const r=svg.getBoundingClientRect(); showTip(e.clientX, e.clientY, e.clientX-r.left); });
  overlay.addEventListener('touchmove', e => { e.preventDefault(); const r=svg.getBoundingClientRect(); const t=e.touches[0]; showTip(t.clientX, t.clientY, t.clientX-r.left); }, { passive:false });
  overlay.addEventListener('mouseleave', () => { vLine.style.display='none'; hRDot.style.display='none'; hEDot.style.display='none'; tt.classList.remove('vis'); });

  outer.appendChild(svg);
}

// ── Update status ─────────────────────────────────────────
function updateStatus(rows, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const vis = rows.filter(r => r.date >= cutoff.toISOString().slice(0, 10));
  if (!vis.length) return;
  const today = vis[vis.length - 1];
  const meta = STATUS_META[today.hrv_status] || STATUS_META.UNKNOWN;
  const le = document.getElementById('re-status-label');
  const me = document.getElementById('re-status-msg');
  if (le) { le.textContent = meta.label; le.style.color = meta.color; }
  if (me) me.textContent = meta.msg;
}

// ── Public ────────────────────────────────────────────────
export function readinessSetPeriod(days) {
  rs.activeDays = days;
  document.querySelectorAll('.re-period-btn').forEach(b =>
    b.classList.toggle('active', +b.dataset.d === days));
  if (rs.rows.length) { drawChart(rs.rows, days); updateStatus(rs.rows, days); }
}
window.readinessSetPeriod = readinessSetPeriod;

export async function renderReadiness() {
  injectStyles();
  const container = document.getElementById('panel-readiness');
  container.innerHTML = `
    <div class="re-title">Recovery vs. Exertion</div>
    <div class="re-period-wrap">
      ${PERIODS.map(p => `<button class="re-period-btn${p.days===DEFAULT_DAYS?' active':''}" data-d="${p.days}" onclick="readinessSetPeriod(${p.days})">${p.label}</button>`).join('')}
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
    if (!rs.fetched) { rs.rows = await fetchReadiness(); rs.fetched = true; }
    if (!rs.rows.length) {
      document.getElementById('re-chart-outer').innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#5A6A88;font-size:.8rem;">No readiness data</div>';
      return;
    }
    updateStatus(rs.rows, rs.activeDays);
    const outer = document.getElementById('re-chart-outer');
    if (outer.clientWidth > 0) {
      drawChart(rs.rows, rs.activeDays);
    } else {
      const ro = new ResizeObserver(entries => {
        for (const e of entries) {
          if (e.contentRect.width > 0) { ro.disconnect(); drawChart(rs.rows, rs.activeDays); }
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
