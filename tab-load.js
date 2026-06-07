import { state, SB_URL, SB_KEY } from './shared.js';

// ── Constants ──────────────────────────────────────────────
const CTL_DAYS = 42;  // Fitness time constant
const ATL_DAYS = 7;   // Fatigue time constant
const CTL_K = 1 - Math.exp(-1 / CTL_DAYS);
const ATL_K = 1 - Math.exp(-1 / ATL_DAYS);

const PERIODS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '12M', months: 12 },
  { label: '24M', months: 24 }
];
const DEFAULT_PERIOD = 6;

// Colours matching reference
const C_LOAD    = '#C8A0E8'; // yellow-white stress dots
const C_CTL     = '#A070D0'; // purple — Fitness
const C_ATL     = '#E08030'; // orange — Fatigue
const C_TSB     = '#E0D060'; // yellow — Form
const C_OPTIMAL = 'rgba(255,255,255,0.07)';

// Sport type → short label
const sportLabel = t => {
  if (!t) return 'Activity';
  const s = t.toLowerCase();
  if (s.includes('run')) return '🏃 Run';
  if (s.includes('ride') || s.includes('cycl')) return '🚴 Ride';
  if (s.includes('swim')) return '🏊 Swim';
  if (s.includes('walk')) return '🚶 Walk';
  if (s.includes('hike')) return '🥾 Hike';
  return '⚡ ' + t;
};

// ── Module state ───────────────────────────────────────────
let loadState = {
  activePeriod: DEFAULT_PERIOD,
  allActivities: [],   // full history fetched once
  fetched: false,
  tooltip: null
};

// ── HTML shell ─────────────────────────────────────────────
export const loadHTML = `
  <div class="load-header">
    <div class="load-title-group">
      <div class="load-eyebrow">Training Load</div>
      <div class="load-pmc-vals">
        <span class="load-val-item ctl">Fitness <span id="load-ctl-val">—</span></span>
        <span class="load-val-item atl">Fatigue <span id="load-atl-val">—</span></span>
        <span class="load-val-item tsb">Form <span id="load-tsb-val">—</span></span>
      </div>
    </div>
    <div class="load-period-wrap">
      ${PERIODS.map(p => `<button class="load-period-btn${p.months === DEFAULT_PERIOD ? ' active' : ''}" data-m="${p.months}" onclick="loadSetPeriod(${p.months})">${p.label}</button>`).join('')}
    </div>
  </div>

  <div class="load-card">
    <div class="load-chart-inner">
      <div id="load-chart-wrap" class="load-chart-wrap"></div>
    </div>
    <div class="load-legend">
      <div class="load-legend-item"><div class="load-leg-dot" style="background:${C_CTL}"></div>Fitness (CTL)</div>
      <div class="load-legend-item"><div class="load-leg-dot" style="background:${C_ATL}"></div>Fatigue (ATL)</div>
      <div class="load-legend-item"><div class="load-leg-dot" style="background:${C_TSB}"></div>Form (TSB)</div>
      <div class="load-legend-item"><div class="load-leg-dot" style="background:${C_LOAD};border-radius:2px"></div>Load</div>
    </div>
  </div>

  <div id="load-tt" class="load-tt"></div>
`;

// ── Fetch all activities needed for CTL warmup ─────────────
async function fetchAllActivities() {
  // Fetch 2 years to allow CTL to warm up properly
  const since = new Date();
  since.setFullYear(since.getFullYear() - 2);
  const sinceStr = since.toISOString().slice(0, 10);

  const cols = 'start_time_local,training_load,sport_type,activity_name,distance_m,avg_hr';
  const url = SB_URL + '/rest/v1/activities?select=' + cols +
    '&start_time_local=gte.' + sinceStr + 'T00:00:00' +
    '&order=start_time_local.asc&limit=2000';

  const res = await fetch(url, {
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
  });
  if (!res.ok) throw new Error('Load fetch error ' + res.status);
  return res.json();
}

// ── Build PMC data series ──────────────────────────────────
function buildPMC(activities) {
  if (!activities.length) return [];

  const byDate = {};
  activities.forEach(a => {
    const d = a.start_time_local ? a.start_time_local.slice(0, 10) : null;
    if (!d) return;
    const tl = parseFloat(a.training_load) || 0;
    if (!byDate[d]) byDate[d] = { load: 0, acts: [] };
    byDate[d].load += tl;
    byDate[d].acts.push(a);
  });

  // Build daily series from first activity to today
  const dates = Object.keys(byDate).sort();
  if (!dates.length) return [];

  const start = new Date(dates[0]);
  const end   = new Date();
  const series = [];
  let ctl = 0, atl = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    const day = byDate[ds] || { load: 0, acts: [] };
    ctl = ctl + CTL_K * (day.load - ctl);
    atl = atl + ATL_K * (day.load - atl);
    const tsb = ctl - atl;
    series.push({
      date: ds,
      load: day.load,
      acts: day.acts,
      ctl: +ctl.toFixed(1),
      atl: +atl.toFixed(1),
      tsb: +tsb.toFixed(1)
    });
  }
  return series;
}

// ── Draw chart ─────────────────────────────────────────────
function drawPMC(series, months) {
  const wrap = document.getElementById('load-chart-wrap');
  if (!wrap) return;
  d3.select('#load-chart-wrap').selectAll('*').remove();

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutStr = cutoff.toISOString().slice(0, 10);
  const visible = series.filter(d => d.date >= cutStr);
  if (!visible.length) return;

  const W = wrap.clientWidth  || 340;
  const H = wrap.clientHeight || 220;
  const pT = 14, pB = 28, pL = 36, pR = 14;

  // Value ranges
  const ctlVals = visible.map(d => d.ctl);
  const atlVals = visible.map(d => d.atl);
  const tsbVals = visible.map(d => d.tsb);
  const loadVals = visible.map(d => d.load);

  const allPos = [...ctlVals, ...atlVals, ...loadVals];
  const allNeg = [...tsbVals];
  const maxV = Math.max(...allPos, 0) + 5;
  const minV = Math.min(...allNeg, 0) - 5;

  const n = visible.length;
  const xS = i => pL + (i / (n - 1)) * (W - pL - pR);
  const yS = v => pT + ((maxV - v) / (maxV - minV)) * (H - pT - pB);
  const y0 = yS(0);

  const svg = d3.select('#load-chart-wrap').append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .style('width', '100%').style('height', '100%').style('overflow', 'visible');

  const defs = svg.append('defs');

  // CTL gradient
  const ctlGrad = defs.append('linearGradient').attr('id', 'ctl-grad').attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',1);
  ctlGrad.append('stop').attr('offset','0%').attr('stop-color', C_CTL).attr('stop-opacity', 0.2);
  ctlGrad.append('stop').attr('offset','100%').attr('stop-color', C_CTL).attr('stop-opacity', 0);

  // Optimal TSB zone (-10 to +5 approx) shaded
  const yOptTop = yS(5), yOptBot = yS(-10);
  svg.append('rect')
    .attr('x', pL).attr('y', yOptTop)
    .attr('width', W - pL - pR).attr('height', yOptBot - yOptTop)
    .attr('fill', C_OPTIMAL);

  // Zone labels (right axis)
  const zones = [
    { label: 'Freshness', y: yS(15) },
    { label: 'Neutral',   y: yS(0) },
    { label: 'Optimal',   y: yS(-7) },
    { label: 'Overload',  y: yS(-25) }
  ];
  zones.forEach(z => {
    svg.append('line')
      .attr('x1', pL).attr('x2', W - pR).attr('y1', z.y).attr('y2', z.y)
      .attr('stroke', 'rgba(255,255,255,0.1)').attr('stroke-dasharray', '3,3').attr('stroke-width', 0.8);
    svg.append('text')
      .attr('x', W - pR + 2).attr('y', z.y + 3)
      .attr('font-size', '7px').attr('fill', 'rgba(255,255,255,0.3)')
      .attr('text-anchor', 'start').text(z.label);
  });

  // Y axis ticks
  const yTicks = d3.ticks(minV, maxV, 6);
  yTicks.forEach(t => {
    svg.append('line')
      .attr('x1', pL - 3).attr('x2', pL).attr('y1', yS(t)).attr('y2', yS(t))
      .attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-width', 0.5);
    svg.append('text')
      .attr('x', pL - 5).attr('y', yS(t) + 3)
      .attr('font-size', '8px').attr('fill', 'rgba(255,255,255,0.3)')
      .attr('text-anchor', 'end').text(Math.round(t));
  });

  // Zero line
  svg.append('line')
    .attr('x1', pL).attr('x2', W - pR).attr('y1', y0).attr('y2', y0)
    .attr('stroke', 'rgba(255,255,255,0.25)').attr('stroke-width', 1);

  // Training load bars
  const barW = Math.max(1, Math.floor((W - pL - pR) / n) - 1);
  visible.forEach((d, i) => {
    if (!d.load) return;
    const bh = Math.max(1, y0 - yS(d.load));
    svg.append('rect')
      .attr('x', xS(i) - barW / 2).attr('y', yS(d.load))
      .attr('width', barW).attr('height', bh)
      .attr('fill', C_LOAD).attr('opacity', 0.5).attr('rx', 1);
  });

  // Line generator
  const line = d3.line().defined(d => !isNaN(d.v))
    .x((d, i) => xS(i)).y(d => yS(d.v)).curve(d3.curveMonotoneX);

  // CTL area
  const area = d3.area().defined(d => !isNaN(d.v))
    .x((d, i) => xS(i)).y0(y0).y1(d => yS(d.v)).curve(d3.curveMonotoneX);

  const ctlData = visible.map(d => ({ v: d.ctl }));
  svg.append('path').datum(ctlData).attr('d', area).attr('fill', 'url(#ctl-grad)');
  svg.append('path').datum(ctlData).attr('d', line).attr('fill', 'none')
    .attr('stroke', C_CTL).attr('stroke-width', 2).attr('stroke-linecap', 'round');

  // ATL line
  const atlData = visible.map(d => ({ v: d.atl }));
  svg.append('path').datum(atlData).attr('d', line).attr('fill', 'none')
    .attr('stroke', C_ATL).attr('stroke-width', 2).attr('stroke-linecap', 'round');

  // TSB line
  const tsbData = visible.map(d => ({ v: d.tsb }));
  svg.append('path').datum(tsbData).attr('d', line).attr('fill', 'none')
    .attr('stroke', C_TSB).attr('stroke-width', 1.5).attr('stroke-linecap', 'round');

  // X axis date labels
  const every = n > 180 ? 30 : n > 60 ? 14 : n > 30 ? 7 : 3;
  visible.forEach((d, i) => {
    if (i % every === 0 || i === n - 1) {
      const dt = new Date(d.date + 'T12:00:00');
      const lbl = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      svg.append('text').attr('x', xS(i)).attr('y', H - 6)
        .attr('text-anchor', 'middle').attr('font-size', '7.5px')
        .attr('fill', 'rgba(255,255,255,0.3)').text(lbl);
    }
  });

  // Update header values (today = last point)
  const last = visible[visible.length - 1];
  const ctlEl = document.getElementById('load-ctl-val');
  const atlEl = document.getElementById('load-atl-val');
  const tsbEl = document.getElementById('load-tsb-val');
  if (ctlEl) ctlEl.textContent = last.ctl.toFixed(1);
  if (atlEl) atlEl.textContent = last.atl.toFixed(1);
  if (tsbEl) {
    tsbEl.textContent = (last.tsb > 0 ? '+' : '') + last.tsb.toFixed(1);
    tsbEl.style.color = last.tsb > 5 ? '#7ED4A0' : last.tsb < -20 ? '#FF5A6E' : C_TSB;
  }

  // Tooltip overlay
  const overlay = svg.append('rect')
    .attr('x', pL).attr('y', pT)
    .attr('width', W - pL - pR).attr('height', H - pT - pB)
    .attr('fill', 'transparent').style('cursor', 'crosshair');

  const vLine = svg.append('line').attr('y1', pT).attr('y2', H - pB)
    .attr('stroke', 'rgba(255,255,255,0.35)').attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,2').style('display', 'none');

  const ctlDot = svg.append('circle').attr('r', 4).attr('fill', C_CTL).style('display','none');
  const atlDot = svg.append('circle').attr('r', 4).attr('fill', C_ATL).style('display','none');
  const tsbDot = svg.append('circle').attr('r', 4).attr('fill', C_TSB).style('display','none');

  const tt = document.getElementById('load-tt');

  overlay.on('mousemove touchmove', function(event) {
    const [mx] = d3.pointer(event, this);
    const rawIdx = Math.round((mx / (W - pL - pR)) * (n - 1));
    const idx = Math.max(0, Math.min(n - 1, rawIdx));
    const pt = visible[idx];

    vLine.attr('x1', xS(idx)).attr('x2', xS(idx)).style('display', null);
    ctlDot.attr('cx', xS(idx)).attr('cy', yS(pt.ctl)).style('display', null);
    atlDot.attr('cx', xS(idx)).attr('cy', yS(pt.atl)).style('display', null);
    tsbDot.attr('cx', xS(idx)).attr('cy', yS(pt.tsb)).style('display', null);

    const dt  = new Date(pt.date + 'T12:00:00');
    const dls = dt.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    const actRows = pt.acts.map(a => {
      const km = a.distance_m ? (a.distance_m / 1000).toFixed(1) + ' km' : '';
      return `<div class="ltt-act-row"><span class="ltt-act-name">${sportLabel(a.sport_type)}${a.activity_name ? ' · ' + a.activity_name : ''}</span><span class="ltt-act-km">${km}</span></div>`;
    }).join('');

    tt.innerHTML = `
      <div class="ltt-date">${dls}</div>
      ${pt.load ? `<div class="ltt-load-row">Training Load <span style="color:${C_LOAD}">${pt.load.toFixed(0)}</span></div>` : ''}
      ${actRows}
      <div class="ltt-divider"></div>
      <div class="ltt-row">Fitness (CTL) <span style="color:${C_CTL}">${pt.ctl.toFixed(1)}</span></div>
      <div class="ltt-row">Fatigue (ATL) <span style="color:${C_ATL}">${pt.atl.toFixed(1)}</span></div>
      <div class="ltt-row">Form (TSB) <span style="color:${C_TSB}">${(pt.tsb > 0 ? '+' : '') + pt.tsb.toFixed(1)}</span></div>
    `;

    const rect = wrap.getBoundingClientRect();
    const ttX = rect.left + xS(idx) + 12;
    const ttY = rect.top  + yS(pt.ctl) - 20;
    tt.style.left = Math.min(ttX, window.innerWidth - 200) + 'px';
    tt.style.top  = Math.max(8, ttY) + 'px';
    tt.classList.add('vis');
  });

  overlay.on('mouseleave touchend', () => {
    vLine.style('display', 'none');
    ctlDot.style('display','none');
    atlDot.style('display','none');
    tsbDot.style('display','none');
    tt.classList.remove('vis');
  });
}

// ── Public API ─────────────────────────────────────────────
export function loadSetPeriod(months) {
  loadState.activePeriod = months;
  document.querySelectorAll('.load-period-btn').forEach(b =>
    b.classList.toggle('active', +b.dataset.m === months));
  if (loadState.pmcSeries) drawPMC(loadState.pmcSeries, months);
}
window.loadSetPeriod = loadSetPeriod;

export async function renderLoad() {
  const container = document.getElementById('panel-load');
  container.innerHTML = loadHTML;

  try {
    if (!loadState.fetched) {
      loadState.allActivities = await fetchAllActivities();
      loadState.fetched = true;
    }
    loadState.pmcSeries = buildPMC(loadState.allActivities);
    requestAnimationFrame(() => drawPMC(loadState.pmcSeries, loadState.activePeriod));
  } catch (e) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--low);font-size:.8rem;">⚠️ ' + e.message + '</div>';
  }
}
