import { state, SB_URL, SB_KEY } from './shared.js';

const PERIODS = [
  { label: '7 Days',  days: 7  },
  { label: '30 Days', days: 30 },
  { label: '60 Days', days: 60 }
];
const DEFAULT_DAYS = 7;

const C_RECOVERY = '#9CA3AF';   // grey  — Recovery line
const C_EXERTION = '#3B82F6';   // blue  — Exertion line
const C_BAND     = 'rgba(150,150,170,0.18)'; // grey band fill
const C_GREEN    = '#4ADE80';
const C_AMBER    = '#F59E0B';
const C_RED      = '#F87171';

const STATUS_META = {
  BALANCED:   { color: C_GREEN,  label: 'Balanced',   msg: 'Good job listening to your body and planning your training accordingly.' },
  UNBALANCED: { color: C_AMBER,  label: 'Unbalanced', msg: 'Your exertion is not well matched to your recovery. Consider adjusting your training load.' },
  LOW:        { color: C_RED,    label: 'Low',        msg: 'Your recovery is low. Prioritise rest, sleep and easy activity today.' },
  UNKNOWN:    { color: C_AMBER,  label: 'Unknown',    msg: 'Not enough data to assess your balance today.' }
};

const dotColor = status => {
  if (!status) return C_AMBER;
  const s = status.toUpperCase();
  if (s === 'BALANCED')   return C_GREEN;
  if (s === 'LOW')        return C_RED;
  return C_AMBER;
};

let rs = {
  activeDays: DEFAULT_DAYS,
  rows: [],
  fetched: false
};

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('readiness-styles')) return;
  const s = document.createElement('style');
  s.id = 'readiness-styles';
  s.textContent = `
    #panel-readiness {
      padding: 20px 18px 32px;
      display: flex;
      flex-direction: column;
      gap: 0;
      background: var(--bg, #0D1117);
      min-height: 100%;
    }

    .re-title {
      font-size: 1.45rem;
      font-weight: 800;
      color: #CDD8EE;
      margin-bottom: 16px;
      letter-spacing: -.01em;
    }

    /* Period tabs */
    .re-period-wrap {
      display: flex;
      background: #161D2E;
      border: 1px solid #1E2A42;
      border-radius: 14px;
      padding: 3px;
      gap: 2px;
      margin-bottom: 22px;
    }
    .re-period-btn {
      flex: 1;
      padding: 9px 4px;
      font-size: .74rem;
      font-weight: 700;
      border: none;
      border-radius: 11px;
      background: transparent;
      color: #5A6A88;
      cursor: pointer;
      font-family: inherit;
      -webkit-tap-highlight-color: transparent;
      transition: all 200ms;
      text-align: center;
    }
    .re-period-btn.active {
      background: #232E48;
      color: #CDD8EE;
      box-shadow: 0 2px 10px rgba(0,0,0,.5);
    }

    /* Chart card */
    .re-card {
      background: #101828;
      border: 1px solid #1A2640;
      border-radius: 18px;
      padding: 16px 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 18px;
    }
    .re-card-title {
      font-size: .85rem;
      font-weight: 800;
      color: #CDD8EE;
      padding: 0 6px;
    }
    .re-chart-outer {
      width: 100%;
      height: 280px;
      position: relative;
    }
    .re-chart-outer svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
    }

    /* Legend */
    .re-legend {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 16px;
      padding: 0 6px;
    }
    .re-legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: .68rem;
      color: #8898BB;
      font-weight: 500;
    }
    .re-leg-line {
      width: 22px;
      height: 3px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .re-leg-box {
      width: 14px;
      height: 10px;
      border-radius: 3px;
      background: rgba(150,150,170,0.35);
      flex-shrink: 0;
    }

    /* Status block */
    .re-status-block {
      padding: 4px 2px 0;
    }
    .re-status-label {
      font-size: 1rem;
      font-weight: 800;
      margin-bottom: 4px;
    }
    .re-status-msg {
      font-size: .8rem;
      color: #8898BB;
      line-height: 1.5;
    }

    /* Tooltip */
    .re-tt {
      position: fixed;
      pointer-events: none;
      opacity: 0;
      background: rgba(13,17,23,0.97);
      border: 1px solid #1E2A42;
      border-radius: 12px;
      padding: 10px 14px;
      z-index: 9999;
      box-shadow: 0 8px 32px rgba(0,0,0,.8);
      transition: opacity 120ms ease;
      min-width: 160px;
      backdrop-filter: blur(8px);
    }
    .re-tt.vis { opacity: 1; }
    .rett-date {
      font-size: .65rem;
      font-weight: 700;
      color: #CDD8EE;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #1E2A42;
    }
    .rett-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: .7rem;
      color: #5A6A88;
      margin-bottom: 3px;
      font-weight: 600;
    }
  `;
  document.head.appendChild(s);
}

// ── Fetch ─────────────────────────────────────────────────
async function fetchReadiness() {
  const since = new Date();
  since.setDate(since.getDate() - 65); // fetch 65 days max
  const cols = 'date,body_battery_at_wake,body_battery_drained,hrv_status,sleep_score,stress_avg';
  const url = SB_URL + '/rest/v1/wellness_daily?select=' + cols +
    '&date=gte.' + since.toISOString().slice(0, 10) +
    '&order=date.asc&limit=70';
  const res = await fetch(url, {
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
  });
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
  const H = outer.clientHeight || 280;
  const pT = 14, pB = 36, pL = 34, pR = 40;

  // Slice to window
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutStr = cutoff.toISOString().slice(0, 10);
  const vis = rows.filter(r => r.date >= cutStr && r.body_battery_at_wake != null);
  if (!vis.length) return;

  const n = vis.length;
  // Scale: 0–10 (maps to 0–100% battery)
  const minV = 0, maxV = 10;

  const xS = i => pL + (i / Math.max(n - 1, 1)) * (W - pL - pR);
  const yS = v => pT + ((maxV - v) / (maxV - minV)) * (H - pT - pB);

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

  // Y axis grid lines: 0.0 / 3.3 / 6.6 / 10.0
  const yTicks = [0, 3.3, 6.6, 10];
  const pctLabels = { 0: '0%', 3.3: '33%', 6.6: '66%', 10: '100%' };
  const pctColors = { 0: C_RED, 3.3: C_AMBER, 6.6: '#3B82F6', 10: C_GREEN };

  yTicks.forEach(t => {
    const y = yS(t);
    svg.appendChild(mk('line', { x1:pL, x2:W-pR, y1:y, y2:y, stroke:'rgba(255,255,255,0.07)', 'stroke-width':'1' }));
    // Left axis numeric
    svg.appendChild(mk('text', { x:pL-5, y:y+3.5, 'font-size':'9', fill:'#3B82F6', 'text-anchor':'end', 'font-weight':'600' }, t.toFixed(1)));
    // Right axis pct
    svg.appendChild(mk('text', { x:W-pR+5, y:y+3.5, 'font-size':'9', fill: pctColors[t], 'text-anchor':'start', 'font-weight':'700' }, pctLabels[t]));
  });

  // X dashed vertical grid + date labels
  const every = n > 20 ? Math.ceil(n / 10) : n > 10 ? 3 : 1;
  vis.forEach((d, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    const x = xS(i);
    svg.appendChild(mk('line', { x1:x, x2:x, y1:pT, y2:H-pB, stroke:'rgba(255,255,255,0.06)', 'stroke-dasharray':'3,3', 'stroke-width':'1' }));
    const dt = new Date(d.date + 'T12:00:00');
    const lbl = days <= 7
      ? dt.toLocaleDateString('en-GB', { weekday:'short' })
      : dt.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
    svg.appendChild(mk('text', { x, y:H-pB+14, 'text-anchor':'middle', 'font-size':'9', fill:'rgba(255,255,255,0.3)' }, lbl));
  });

  // ── Target Exertion Band ────────────────────────────────
  // Band = 30%–80% of recovery (body_battery_at_wake / 10)
  const bandPts = vis.map((d, i) => {
    const rec = (d.body_battery_at_wake || 0) / 10;
    return { x: xS(i), yMin: yS(rec * 0.3), yMax: yS(rec * 0.8) };
  });
  const topPts  = bandPts.map(p => p.x + ',' + p.yMax).join(' ');
  const botPts  = [...bandPts].reverse().map(p => p.x + ',' + p.yMin).join(' ');
  svg.appendChild(mk('polygon', { points: topPts + ' ' + botPts, fill: C_BAND }));

  // ── Recovery line (grey) ────────────────────────────────
  const recPts = vis.map((d, i) => xS(i) + ',' + yS((d.body_battery_at_wake || 0) / 10)).join(' ');
  svg.appendChild(mk('polyline', { points: recPts, fill:'none', stroke: C_RECOVERY, 'stroke-width':'2.5', 'stroke-linecap':'round', 'stroke-linejoin':'round' }));

  // Recovery dots + % labels
  vis.forEach((d, i) => {
    const recVal = (d.body_battery_at_wake || 0) / 10;
    const cx = xS(i), cy = yS(recVal);
    const dc = dotColor(d.hrv_status);
    svg.appendChild(mk('circle', { cx, cy, r:'5', fill: dc, stroke:'#101828', 'stroke-width':'2' }));
    // Pct label above dot
    const pctTxt = Math.round(recVal * 10) + '%';
    const labelY = cy - 9;
    svg.appendChild(mk('text', { x:cx, y:labelY, 'text-anchor':'middle', 'font-size':'9', fill:'#CDD8EE', 'font-weight':'700' }, pctTxt));
  });

  // ── Exertion line (blue) ────────────────────────────────
  const exPts = vis.map((d, i) => xS(i) + ',' + yS((d.body_battery_drained || 0) / 10)).join(' ');
  svg.appendChild(mk('polyline', { points: exPts, fill:'none', stroke: C_EXERTION, 'stroke-width':'2.5', 'stroke-linecap':'round', 'stroke-linejoin':'round' }));

  // Exertion dots (solid blue, no label to avoid clash — label on hover)
  vis.forEach((d, i) => {
    const exVal = (d.body_battery_drained || 0) / 10;
    svg.appendChild(mk('circle', { cx:xS(i), cy:yS(exVal), r:'4', fill: C_EXERTION, stroke:'#101828', 'stroke-width':'2' }));
  });

  // ── Hover overlay ───────────────────────────────────────
  const overlay = mk('rect', { x:pL, y:pT, width:W-pL-pR, height:H-pT-pB, fill:'transparent' });
  overlay.style.cursor = 'crosshair';
  const vLine = mk('line', { y1:pT, y2:H-pB, stroke:'rgba(255,255,255,0.25)', 'stroke-width':'1', 'stroke-dasharray':'3,2' });
  vLine.style.display = 'none';
  const hRecDot = mk('circle', { r:'6', fill: C_RECOVERY, stroke:'#101828', 'stroke-width':'2' }); hRecDot.style.display='none';
  const hExDot  = mk('circle', { r:'6', fill: C_EXERTION,  stroke:'#101828', 'stroke-width':'2' }); hExDot.style.display='none';
  [vLine, hRecDot, hExDot, overlay].forEach(el => svg.appendChild(el));

  const tt = document.getElementById('re-tt');

  const showTip = (cx, cy, lx) => {
    const idx = Math.max(0, Math.min(n-1, Math.round(((lx - pL) / (W-pL-pR)) * (n-1))));
    const d = vis[idx];
    const recVal = (d.body_battery_at_wake || 0) / 10;
    const exVal  = (d.body_battery_drained || 0) / 10;
    const bandMin = recVal * 0.3, bandMax = recVal * 0.8;
    const inBand  = exVal >= bandMin && exVal <= bandMax;

    vLine.setAttribute('x1', xS(idx)); vLine.setAttribute('x2', xS(idx)); vLine.style.display = '';
    hRecDot.setAttribute('cx', xS(idx)); hRecDot.setAttribute('cy', yS(recVal));
    hRecDot.setAttribute('fill', dotColor(d.hrv_status)); hRecDot.style.display = '';
    hExDot.setAttribute('cx', xS(idx));  hExDot.setAttribute('cy', yS(exVal));  hExDot.style.display = '';

    const dls = new Date(d.date+'T12:00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'short' });
    const exStatus = exVal > bandMax ? '⬆️ Above target' : exVal < bandMin ? '⬇️ Below target' : '✅ In target range';

    tt.innerHTML = `
      <div class="rett-date">${dls}</div>
      <div class="rett-row"><span style="color:${C_RECOVERY}">Recovery</span><span style="color:#CDD8EE;font-weight:900">${Math.round(recVal * 10)}%</span></div>
      <div class="rett-row"><span style="color:${C_EXERTION}">Exertion</span><span style="color:#CDD8EE;font-weight:900">${Math.round(exVal * 10)}%</span></div>
      <div class="rett-row"><span style="color:#5A6A88">Target range</span><span style="color:#8898BB">${Math.round(bandMin*10)}–${Math.round(bandMax*10)}%</span></div>
      <div class="rett-row" style="margin-top:4px"><span style="color:#8898BB;font-size:.62rem">${exStatus}</span></div>
      ${d.sleep_score ? `<div class="rett-row"><span style="color:#5A6A88">Sleep score</span><span style="color:#8898BB">${d.sleep_score}</span></div>` : ''}
    `;
    tt.style.left = Math.min(cx+14, window.innerWidth-190) + 'px';
    tt.style.top  = Math.max(8, cy-80) + 'px';
    tt.classList.add('vis');
  };

  overlay.addEventListener('mousemove', e => { const r=svg.getBoundingClientRect(); showTip(e.clientX, e.clientY, e.clientX-r.left); });
  overlay.addEventListener('touchmove', e => { e.preventDefault(); const r=svg.getBoundingClientRect(); const t=e.touches[0]; showTip(t.clientX, t.clientY, t.clientX-r.left); }, { passive:false });
  overlay.addEventListener('mouseleave', () => { vLine.style.display='none'; hRecDot.style.display='none'; hExDot.style.display='none'; tt.classList.remove('vis'); });

  outer.appendChild(svg);
}

// ── Update status block ───────────────────────────────────
function updateStatus(rows, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const vis = rows.filter(r => r.date >= cutoff.toISOString().slice(0, 10));
  if (!vis.length) return;

  const today = vis[vis.length - 1];
  const meta = STATUS_META[today.hrv_status] || STATUS_META.UNKNOWN;

  const labelEl = document.getElementById('re-status-label');
  const msgEl   = document.getElementById('re-status-msg');
  if (labelEl) { labelEl.textContent = meta.label; labelEl.style.color = meta.color; }
  if (msgEl)   { msgEl.textContent = meta.msg; }
}

// ── Public ────────────────────────────────────────────────
export function readinessSetPeriod(days) {
  rs.activeDays = days;
  document.querySelectorAll('.re-period-btn').forEach(b =>
    b.classList.toggle('active', +b.dataset.d === days));
  if (rs.rows.length) {
    drawChart(rs.rows, days);
    updateStatus(rs.rows, days);
  }
}
window.readinessSetPeriod = readinessSetPeriod;

export async function renderReadiness() {
  injectStyles();

  const container = document.getElementById('panel-readiness');
  container.innerHTML = `
    <div class="re-title">Recovery vs. Exertion</div>

    <div class="re-period-wrap">
      ${PERIODS.map(p => `
        <button class="re-period-btn${p.days === DEFAULT_DAYS ? ' active' : ''}"
          data-d="${p.days}" onclick="readinessSetPeriod(${p.days})">${p.label}</button>
      `).join('')}
    </div>

    <div class="re-card">
      <div class="re-chart-outer" id="re-chart-outer"></div>
      <div class="re-legend">
        <div class="re-legend-item">
          <div class="re-leg-line" style="background:${C_RECOVERY}"></div>
          Recovery
        </div>
        <div class="re-legend-item">
          <div class="re-leg-box"></div>
          Target Exertion Range
        </div>
        <div class="re-legend-item">
          <div class="re-leg-line" style="background:${C_EXERTION}"></div>
          Exertion
        </div>
        <div class="re-legend-item" style="gap:6px">
          <div style="display:flex;gap:3px">
            <div style="width:8px;height:8px;border-radius:50%;background:${C_GREEN}"></div>
            <div style="width:8px;height:8px;border-radius:50%;background:${C_AMBER}"></div>
            <div style="width:8px;height:8px;border-radius:50%;background:${C_RED}"></div>
          </div>
          HRV Status
        </div>
      </div>
    </div>

    <div class="re-status-block">
      <div class="re-status-label" id="re-status-label">—</div>
      <div class="re-status-msg" id="re-status-msg"></div>
    </div>

    <div id="re-tt" class="re-tt"></div>
  `;

  try {
    if (!rs.fetched) {
      rs.rows = await fetchReadiness();
      rs.fetched = true;
    }

    if (!rs.rows.length) {
      document.getElementById('re-chart-outer').innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#5A6A88;font-size:.8rem;">No readiness data found</div>';
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
