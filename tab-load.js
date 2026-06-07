import { state, SB_URL, SB_KEY } from './shared.js';

const CTL_DAYS = 42;
const ATL_DAYS = 7;
const CTL_K = 1 - Math.exp(-1 / CTL_DAYS);
const ATL_K = 1 - Math.exp(-1 / ATL_DAYS);

const PERIODS = [
  { label: '30 Days',   days: 30  },
  { label: '60 Days',   days: 60  },
  { label: '6 Months',  days: 182 },
  { label: 'Year',      days: 365 }
];
const DEFAULT_DAYS = 60;

const C_CTL = '#00D4C8';   // cyan  — Fitness
const C_ATL = '#8B5CF6';   // purple — Fatigue

let ls = {
  activeDays: DEFAULT_DAYS,
  allActivities: [],
  pmcSeries: null,
  fetched: false
};

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('load-tab-styles')) return;
  const s = document.createElement('style');
  s.id = 'load-tab-styles';
  s.textContent = `
    #panel-load {
      padding: 20px 18px 32px;
      display: flex;
      flex-direction: column;
      gap: 0;
      background: var(--bg, #0D1117);
      min-height: 100%;
    }

    .load-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: #CDD8EE;
      margin-bottom: 18px;
      letter-spacing: -.01em;
    }

    /* Period tabs */
    .load-period-wrap {
      display: flex;
      background: #161D2E;
      border: 1px solid #1E2A42;
      border-radius: 14px;
      padding: 3px;
      gap: 2px;
      margin-bottom: 28px;
    }
    .load-period-btn {
      flex: 1;
      padding: 8px 4px;
      font-size: .72rem;
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
      white-space: nowrap;
    }
    .load-period-btn.active {
      background: #232E48;
      color: #CDD8EE;
      box-shadow: 0 2px 10px rgba(0,0,0,.5);
    }

    /* Big metric row */
    .load-metrics-row {
      display: flex;
      gap: 36px;
      margin-bottom: 22px;
      align-items: flex-start;
    }
    .load-metric {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .load-metric-label {
      font-size: .78rem;
      font-weight: 800;
      letter-spacing: .02em;
      text-transform: none;
    }
    .load-metric-label.ctl { color: ${C_CTL}; }
    .load-metric-label.atl { color: ${C_ATL}; }
    .load-metric-main-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .load-metric-big {
      font-size: 3rem;
      font-weight: 900;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      color: #CDD8EE;
    }
    .load-metric-prev {
      font-size: .85rem;
      font-weight: 600;
      color: #5A6A88;
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .load-metric-prev .arrow-down { color: #FF5A6E; }
    .load-metric-prev .arrow-up   { color: #00D4C8; }

    /* Chart */
    .load-chart-outer {
      width: 100%;
      height: 280px;
      position: relative;
    }
    .load-chart-outer svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
    }

    /* Legend */
    .load-legend {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 20px;
    }
    .load-legend-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: .72rem;
      color: #8898BB;
      font-weight: 500;
    }
    .load-leg-circle {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* Tooltip */
    .load-tt {
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
    .load-tt.vis { opacity: 1; }
    .ltt-date {
      font-size: .65rem;
      font-weight: 700;
      color: #CDD8EE;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #1E2A42;
    }
    .ltt-row {
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
async function fetchAllActivities() {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 2);
  const cols = 'start_time_utc,training_load';
  const url = SB_URL + '/rest/v1/activities?select=' + cols +
    '&start_time_utc=gte.' + since.toISOString() +
    '&order=start_time_utc.asc&limit=2000';
  const res = await fetch(url, {
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
  });
  if (!res.ok) throw new Error('Load fetch error ' + res.status);
  return res.json();
}

// ── Build PMC ─────────────────────────────────────────────
function buildPMC(activities) {
  if (!activities.length) return [];
  const byDate = {};
  activities.forEach(a => {
    const d = a.start_time_utc ? a.start_time_utc.slice(0, 10) : null;
    if (!d) return;
    const tl = parseFloat(a.training_load) || 0;
    byDate[d] = (byDate[d] || 0) + tl;
  });

  const dates = Object.keys(byDate).sort();
  if (!dates.length) return [];

  const end = new Date();
  const series = [];
  let ctl = 0, atl = 0;
  for (let d = new Date(dates[0] + 'T12:00:00Z'); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    const load = byDate[ds] || 0;
    ctl = ctl + CTL_K * (load - ctl);
    atl = atl + ATL_K * (load - atl);
    series.push({ date: ds, load, ctl: +ctl.toFixed(1), atl: +atl.toFixed(1) });
  }
  return series;
}

// ── Draw ──────────────────────────────────────────────────
function drawPMC(series, days) {
  const outer = document.getElementById('load-chart-outer');
  if (!outer) return;
  const old = outer.querySelector('svg');
  if (old) old.remove();

  const W = outer.clientWidth || 340;
  const H = outer.clientHeight || 280;
  const pT = 12, pB = 32, pL = 40, pR = 12;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutStr = cutoff.toISOString().slice(0, 10);
  const vis = series.filter(d => d.date >= cutStr);
  if (!vis.length) return;

  const n = vis.length;
  const allV = vis.flatMap(d => [d.ctl, d.atl]);
  const minV = Math.min(...allV) - 8;
  const maxV = Math.max(...allV) + 8;

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

  // Defs — gradients under each line
  const defs = mk('defs');

  const ctlGrad = mk('linearGradient', { id:'g-ctl', x1:0, y1:0, x2:0, y2:1 });
  ctlGrad.appendChild(mk('stop', { offset:'0%',   'stop-color':C_CTL, 'stop-opacity':'0.22' }));
  ctlGrad.appendChild(mk('stop', { offset:'100%', 'stop-color':C_CTL, 'stop-opacity':'0' }));
  defs.appendChild(ctlGrad);

  const atlGrad = mk('linearGradient', { id:'g-atl', x1:0, y1:0, x2:0, y2:1 });
  atlGrad.appendChild(mk('stop', { offset:'0%',   'stop-color':C_ATL, 'stop-opacity':'0.22' }));
  atlGrad.appendChild(mk('stop', { offset:'100%', 'stop-color':C_ATL, 'stop-opacity':'0' }));
  defs.appendChild(atlGrad);
  svg.appendChild(defs);

  // Y grid lines + labels
  const step = (maxV - minV) > 100 ? 20 : (maxV - minV) > 60 ? 10 : 5;
  for (let t = Math.ceil(minV / step) * step; t <= maxV; t += step) {
    const y = yS(t);
    if (y < pT || y > H - pB) continue;
    svg.appendChild(mk('line', { x1:pL, x2:W-pR, y1:y, y2:y, stroke:'rgba(255,255,255,0.06)', 'stroke-width':'1' }));
    svg.appendChild(mk('text', { x:pL-6, y:y+3.5, 'font-size':'9', fill:'rgba(255,255,255,0.3)', 'text-anchor':'end' }, Math.round(t)));
  }

  // X dashed grid + date labels — one per period tick
  const every = n > 300 ? 60 : n > 120 ? 30 : n > 60 ? 14 : 7;
  vis.forEach((d, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    const x = xS(i);
    svg.appendChild(mk('line', { x1:x, x2:x, y1:pT, y2:H-pB, stroke:'rgba(255,255,255,0.06)', 'stroke-dasharray':'3,3', 'stroke-width':'1' }));
    const dt = new Date(d.date + 'T12:00:00');
    const lbl = dt.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
    svg.appendChild(mk('text', { x, y:H-pB+14, 'text-anchor':'middle', 'font-size':'9', fill:'rgba(255,255,255,0.3)' }, lbl));
  });

  // Area fills (under each line)
  const areaPath = (key, gradId) => {
    const pts = vis.map((d, i) => xS(i) + ',' + yS(d[key])).join(' ');
    const bot = H - pB;
    return mk('polygon', {
      points: xS(0)+','+bot+' '+pts+' '+xS(n-1)+','+bot,
      fill: 'url(#'+gradId+')'
    });
  };
  svg.appendChild(areaPath('ctl', 'g-ctl'));
  svg.appendChild(areaPath('atl', 'g-atl'));

  // Lines
  const drawLine = (key, color, width) => {
    const el = mk('polyline', {
      points: vis.map((d,i) => xS(i)+','+yS(d[key])).join(' '),
      fill: 'none', stroke: color, 'stroke-width': width,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    svg.appendChild(el);
    return el;
  };
  drawLine('ctl', C_CTL, '2.5');
  drawLine('atl', C_ATL, '2.5');

  // Hover overlay
  const overlay = mk('rect', { x:pL, y:pT, width:W-pL-pR, height:H-pT-pB, fill:'transparent' });
  overlay.style.cursor = 'crosshair';
  const vLine = mk('line', { y1:pT, y2:H-pB, stroke:'rgba(255,255,255,0.3)', 'stroke-width':'1', 'stroke-dasharray':'3,2' });
  vLine.style.display = 'none';
  const ctlDot = mk('circle', { r:'5', fill:C_CTL, stroke:'#0D1117', 'stroke-width':'2' }); ctlDot.style.display='none';
  const atlDot = mk('circle', { r:'5', fill:C_ATL, stroke:'#0D1117', 'stroke-width':'2' }); atlDot.style.display='none';
  [vLine, ctlDot, atlDot, overlay].forEach(el => svg.appendChild(el));

  const tt = document.getElementById('load-tt');
  const showTip = (cx, cy, lx) => {
    const idx = Math.max(0, Math.min(n-1, Math.round(((lx - pL) / (W-pL-pR)) * (n-1))));
    const pt = vis[idx];
    vLine.setAttribute('x1', xS(idx)); vLine.setAttribute('x2', xS(idx)); vLine.style.display = '';
    ctlDot.setAttribute('cx', xS(idx)); ctlDot.setAttribute('cy', yS(pt.ctl)); ctlDot.style.display = '';
    atlDot.setAttribute('cx', xS(idx)); atlDot.setAttribute('cy', yS(pt.atl)); atlDot.style.display = '';
    const dls = new Date(pt.date+'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
    tt.innerHTML = `
      <div class="ltt-date">${dls}</div>
      <div class="ltt-row"><span style="color:${C_CTL}">Fitness (CTL)</span><span style="color:${C_CTL};font-weight:900">${pt.ctl.toFixed(1)}</span></div>
      <div class="ltt-row"><span style="color:${C_ATL}">Fatigue (ATL)</span><span style="color:${C_ATL};font-weight:900">${pt.atl.toFixed(1)}</span></div>
      <div class="ltt-row"><span style="color:#8898BB">Form (TSB)</span><span style="color:#8898BB;font-weight:900">${(pt.ctl - pt.atl > 0 ? '+' : '') + (pt.ctl - pt.atl).toFixed(1)}</span></div>`;
    tt.style.left = Math.min(cx+14, window.innerWidth-180) + 'px';
    tt.style.top  = Math.max(8, cy-70) + 'px';
    tt.classList.add('vis');
  };
  overlay.addEventListener('mousemove', e => { const r=svg.getBoundingClientRect(); showTip(e.clientX, e.clientY, e.clientX-r.left); });
  overlay.addEventListener('touchmove', e => { e.preventDefault(); const r=svg.getBoundingClientRect(); const t=e.touches[0]; showTip(t.clientX, t.clientY, t.clientX-r.left); }, { passive:false });
  overlay.addEventListener('mouseleave', () => { vLine.style.display='none'; ctlDot.style.display='none'; atlDot.style.display='none'; tt.classList.remove('vis'); });

  outer.appendChild(svg);
}

// ── Update big metric numbers ─────────────────────────────
function updateMetrics(series, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutStr = cutoff.toISOString().slice(0, 10);
  const vis = series.filter(d => d.date >= cutStr);
  if (vis.length < 2) return;

  const today = vis[vis.length - 1];
  const prev  = vis[vis.length - 2];

  const set = (idBig, idPrev, curVal, prevVal) => {
    const bigEl  = document.getElementById(idBig);
    const prevEl = document.getElementById(idPrev);
    if (bigEl)  bigEl.textContent = Math.round(curVal);
    if (prevEl) {
      const diff = curVal - prevVal;
      const arrow = diff >= 0
        ? '<span class="arrow-up">↑</span>'
        : '<span class="arrow-down">↓</span>';
      prevEl.innerHTML = Math.round(prevVal) + ' ' + arrow;
    }
  };
  set('load-ctl-big', 'load-ctl-prev', today.ctl, prev.ctl);
  set('load-atl-big', 'load-atl-prev', today.atl, prev.atl);
}

// ── Public ────────────────────────────────────────────────
export function loadSetPeriod(days) {
  ls.activeDays = days;
  document.querySelectorAll('.load-period-btn').forEach(b =>
    b.classList.toggle('active', +b.dataset.d === days));
  if (ls.pmcSeries) {
    drawPMC(ls.pmcSeries, days);
    updateMetrics(ls.pmcSeries, days);
  }
}
window.loadSetPeriod = loadSetPeriod;

export async function renderLoad() {
  injectStyles();

  const container = document.getElementById('panel-load');
  container.innerHTML = `
    <div class="load-title">Training Load</div>

    <div class="load-period-wrap">
      ${PERIODS.map(p => `
        <button class="load-period-btn${p.days === DEFAULT_DAYS ? ' active' : ''}"
          data-d="${p.days}" onclick="loadSetPeriod(${p.days})">${p.label}</button>
      `).join('')}
    </div>

    <div class="load-metrics-row">
      <div class="load-metric">
        <div class="load-metric-label ctl">Fitness</div>
        <div class="load-metric-main-row">
          <div class="load-metric-big" id="load-ctl-big">—</div>
          <div class="load-metric-prev" id="load-ctl-prev"></div>
        </div>
      </div>
      <div class="load-metric">
        <div class="load-metric-label atl">Fatigue</div>
        <div class="load-metric-main-row">
          <div class="load-metric-big" id="load-atl-big">—</div>
          <div class="load-metric-prev" id="load-atl-prev"></div>
        </div>
      </div>
    </div>

    <div class="load-chart-outer" id="load-chart-outer"></div>

    <div class="load-legend">
      <div class="load-legend-item">
        <div class="load-leg-circle" style="background:${C_CTL}"></div>
        Fitness – Long Term Training Load
      </div>
      <div class="load-legend-item">
        <div class="load-leg-circle" style="background:${C_ATL}"></div>
        Fatigue – Short Term Training Load
      </div>
    </div>

    <div id="load-tt" class="load-tt"></div>
  `;

  try {
    if (!ls.fetched) {
      ls.allActivities = await fetchAllActivities();
      ls.fetched = true;
    }
    ls.pmcSeries = buildPMC(ls.allActivities);

    if (!ls.pmcSeries.length) {
      document.getElementById('load-chart-outer').innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#5A6A88;font-size:.8rem;">No activity data found</div>';
      return;
    }

    updateMetrics(ls.pmcSeries, ls.activeDays);

    const outer = document.getElementById('load-chart-outer');
    if (outer.clientWidth > 0) {
      drawPMC(ls.pmcSeries, ls.activeDays);
    } else {
      const ro = new ResizeObserver(entries => {
        for (const e of entries) {
          if (e.contentRect.width > 0) { ro.disconnect(); drawPMC(ls.pmcSeries, ls.activeDays); }
        }
      });
      ro.observe(outer);
    }
  } catch (e) {
    console.error(e);
    document.getElementById('panel-load').innerHTML =
      `<div style="padding:24px;text-align:center;color:#FF5A6E;font-size:.8rem;">⚠️ ${e.message}</div>`;
  }
}
